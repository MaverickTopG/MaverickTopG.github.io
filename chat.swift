import SwiftUI
import Combine

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif

struct OrgSummary: Identifiable, Hashable {
    let id: String
    var code: String?
    var name: String
}

struct ThreadSummary: Identifiable, Hashable {
    let id: String
    let title: String
    let preview: String
    let timestamp: Date?
    let isAllVolunteers: Bool
}

struct VolunteerSummary: Identifiable, Hashable {
    let id: String
    let name: String
}

@MainActor
final class MessagesHomeViewModel: ObservableObject {
    @Published var orgs: [OrgSummary] = []
    @Published var currentOrg: OrgSummary?
    @Published var threads: [ThreadSummary] = []
    @Published var isLoading = true
    @Published var showOrgPicker = false
    @Published var showAccount = false
    @Published var path = NavigationPath()
    let pathSubject = CurrentValueSubject<NavigationPath, Never>(NavigationPath())

    private var authHandle: AuthStateDidChangeListenerHandle?
    private var listener: ListenerRegistration?
    private var currentUserId: String?
    private var messageSnapshots: [MessageSnapshot] = []
    private var members: [VolunteerSummary] = []

    func start() {
        #if canImport(FirebaseAuth)
        if authHandle != nil { return }
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            guard let self else { return }
            self.currentUserId = user?.uid
            if let userId = user?.uid {
                self.fetchOrganizations(userId: userId)
            } else {
                self.orgs = []
                self.currentOrg = nil
                self.threads = []
                self.isLoading = false
            }
        }
        #else
        isLoading = false
        #endif
    }

    func stop() {
        #if canImport(FirebaseAuth)
        if let handle = authHandle {
            Auth.auth().removeStateDidChangeListener(handle)
            authHandle = nil
        }
        #endif
        listener?.remove()
        listener = nil
    }

    func selectOrg(_ org: OrgSummary) {
        currentOrg = org
        fetchOrgDetails(for: org)
        fetchOrgMembers(for: org)
        subscribeToMessages(for: org)
    }

    func openThread(_ thread: ThreadSummary) {
        path.append(thread)
        pathSubject.send(path)
    }

    func popThread() {
        guard !path.isEmpty else { return }
        path.removeLast()
        pathSubject.send(path)
    }

    func syncThreadState() {
        pathSubject.send(path)
    }

    private func fetchOrganizations(userId: String) {
        #if canImport(FirebaseFirestore)
        isLoading = true
        let db = Firestore.firestore()
        let userFields = ["user_id", "userId", "uid"]
        let group = DispatchGroup()
        var documents: [QueryDocumentSnapshot] = []
        var userProfileDoc: DocumentSnapshot?

        // 1. Fetch user's own profile document
        group.enter()
        db.collection("users").document(userId).getDocument { snapshot, _ in
            userProfileDoc = snapshot
            group.leave()
        }

        // 2. Fetch from user_organizations
        for field in userFields {
            group.enter()
            db.collection("user_organizations").whereField(field, isEqualTo: userId).getDocuments { snap, _ in
                if let docs = snap?.documents {
                    documents.append(contentsOf: docs)
                }
                group.leave()
            }
        }

        group.notify(queue: .main) { [weak self] in
            guard let self else { return }
            
            // Helper to extract org from a document
            func extractOrg(from data: [String: Any], docId: String) -> OrgSummary? {
                let status = (data["status"] as? String)?.lowercased() ?? ""
                if status.contains("rejected") || status.contains("declined") || status.contains("removed") {
                    return nil
                }
                
                // Check for personal org filters
                if data["is_personal"] as? Bool == true { return nil }
                
                let code = normalizeOrgCode(
                    data["access_code"] ??
                    data["accessCode"] ??
                    data["orgCode"] ??
                    data["org_code"] ??
                    data["organizationCode"] ??
                    data["org_access_code"] ??
                    data["organization_code"]
                )
                let id =
                    data["organizationId"] as? String ??
                    data["orgId"] as? String ??
                    data["org_id"] as? String ??
                    data["organization_id"] as? String ??
                    data["linked_org_id"] as? String ??
                    data["linkedOrgId"] as? String ??
                    docId
                let name =
                    data["name"] as? String ??
                    data["orgName"] as? String ??
                    data["organizationName"] as? String ??
                    data["organization_name"] as? String ??
                    data["schoolName"] as? String ??
                    data["school_name"] as? String ??
                    code ??
                    "Organization"
                
                // Additional personal org filter
                let idLower = id.lowercased()
                let codeLower = (code ?? "").lowercased()
                let nameLower = name.lowercased()
                if idLower.hasPrefix("personal-") || codeLower.hasPrefix("personal-") || nameLower == "personal" {
                    return nil
                }
                
                return OrgSummary(id: id, code: code, name: name)
            }
            
            var items: [OrgSummary] = []
            
            // Process user_organizations docs
            for doc in documents {
                if let org = extractOrg(from: doc.data(), docId: doc.documentID) {
                    items.append(org)
                }
            }
            
            // Process user's own profile (matching web portal logic)
            if let profileSnapshot = userProfileDoc, profileSnapshot.exists,
               let profileData = profileSnapshot.data() {
                if let org = extractOrg(from: profileData, docId: profileSnapshot.documentID) {
                    items.append(org)
                }
            }
            
            // Deduplicate by ID or code
            var seen: Set<String> = []
            var seenCodes: Set<String> = []
            let unique = items.filter { org in
                let hasId = seen.insert(org.id).inserted
                let hasCode = org.code.map { seenCodes.insert($0).inserted } ?? true
                return hasId || hasCode
            }
            
            // Check profile for additional org arrays (like orgIds)
            self.fetchOrgsFromUserProfile(userId: userId, existing: unique)
        }
        #else
        isLoading = false
        #endif
    }

    private func subscribeToMessages(for org: OrgSummary) {
        #if canImport(FirebaseFirestore)
        listener?.remove()
        listener = nil

        let db = Firestore.firestore()
        var query: Query
        if let code = org.code, !code.isEmpty {
            query = db.collection("messages").whereField("orgCode", isEqualTo: code)
        } else {
            query = db.collection("messages").whereField("orgId", isEqualTo: org.id)
        }

        listener = query.addSnapshotListener { [weak self] snapshot, error in
            guard let self else { return }
            if let error = error {
                print("Messages listener error", error)
                return
            }
            let docs = snapshot?.documents ?? []
            let messages: [MessageSnapshot] = docs.map { doc in
                let data = doc.data()
                return MessageSnapshot(
                    id: doc.documentID,
                    text: data["text"] as? String ?? "",
                    createdAt: (data["createdAt"] as? Timestamp)?.dateValue(),
                    senderId: data["senderId"] as? String ?? "",
                    senderName: data["senderName"] as? String ?? "Volunteer",
                    threadId: data["threadId"] as? String ?? "",
                    orgId: data["orgId"] as? String,
                    orgCode: data["orgCode"] as? String
                )
            }
            self.messageSnapshots = messages
            self.rebuildThreads()
        }
        #endif
    }

    private func rebuildThreads() {
        guard let org = currentOrg else {
            threads = []
            return
        }
        threads = buildThreads(from: messageSnapshots, org: org, members: members)
    }

    private func buildThreads(from messages: [MessageSnapshot], org: OrgSummary, members: [VolunteerSummary]) -> [ThreadSummary] {
        let allThreadId = allVolunteersThreadId(for: org)
        var grouped: [String: [MessageSnapshot]] = [:]
        for message in messages {
            guard !message.threadId.isEmpty else { continue }
            grouped[message.threadId, default: []].append(message)
        }

        let orgName = org.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let orgCode = (org.code ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var summaries: [ThreadSummary] = []
        for (threadId, items) in grouped {
            let latest = items.max { (lhs, rhs) in
                (lhs.createdAt ?? .distantPast) < (rhs.createdAt ?? .distantPast)
            }
            let isAll = threadId == allThreadId
            let title = threadTitle(for: threadId, messages: items, isAll: isAll)
            let preview = latest?.text ?? ""
            summaries.append(ThreadSummary(id: threadId, title: title, preview: preview, timestamp: latest?.createdAt, isAllVolunteers: isAll))
        }

        if !orgName.isEmpty {
            summaries = summaries.filter { summary in
                let normalized = summary.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                if normalized == orgName { return false }
                if !orgCode.isEmpty && normalized == orgCode { return false }
                return true
            }
        }

        if !summaries.contains(where: { $0.id == allThreadId }) {
            summaries.append(ThreadSummary(id: allThreadId, title: "All Volunteers", preview: "Start a conversation.", timestamp: nil, isAllVolunteers: true))
        }

        let allVolunteers = summaries.filter { $0.isAllVolunteers }
        var directThreads: [ThreadSummary] = []
        let existingDirect = summaries.filter { $0.id.contains("-user-") }
        var seenNames = Set<String>()

        for member in members {
            if member.id == currentUserId { continue }
            let memberName = member.name.trimmingCharacters(in: .whitespacesAndNewlines)
            if memberName.isEmpty { continue }
            let normalizedName = memberName.lowercased()
            if normalizedName == orgName || (!orgCode.isEmpty && normalizedName == orgCode) {
                continue
            }
            if !seenNames.insert(normalizedName).inserted {
                continue
            }
            if let existing = existingDirect.first(where: { $0.id.hasSuffix("-user-\(member.id)") }) {
                // Keep existing thread info if available
                let updated = ThreadSummary(
                    id: existing.id,
                    title: memberName,
                    preview: existing.preview,
                    timestamp: existing.timestamp,
                    isAllVolunteers: false
                )
                directThreads.append(updated)
                continue
            }

            let threadId = directThreadId(for: org, memberId: member.id)
            let summary = ThreadSummary(
                id: threadId,
                title: memberName,
                preview: "Start a conversation.",
                timestamp: nil,
                isAllVolunteers: false
            )
            directThreads.append(summary)
        }
        let otherThreads = summaries.filter { !$0.isAllVolunteers && !$0.id.contains("-user-") }
        let sortedDirect = directThreads.sorted { $0.title < $1.title }
        let sortedOthers = otherThreads.sorted { (lhs, rhs) in
            (lhs.timestamp ?? .distantPast) > (rhs.timestamp ?? .distantPast)
        }

        return allVolunteers + sortedDirect + sortedOthers
    }

    private func threadTitle(for threadId: String, messages: [MessageSnapshot], isAll: Bool) -> String {
        if isAll { return "All Volunteers" }
        if let currentUserId = currentUserId {
            if let other = messages.last(where: { $0.senderId != currentUserId }) {
                return other.senderName
            }
        }
        return messages.last?.senderName ?? "Volunteer"
    }

    private func allVolunteersThreadId(for org: OrgSummary) -> String {
        if let code = org.code, !code.isEmpty {
            return "org-\(code)-all"
        }
        return "org-\(org.id)-all"
    }

    private func directThreadId(for org: OrgSummary, memberId: String) -> String {
        if let code = org.code, !code.isEmpty {
            return "org-\(code)-user-\(memberId)"
        }
        return "org-\(org.id)-user-\(memberId)"
    }

    private func fetchOrgDetails(for org: OrgSummary) {
        #if canImport(FirebaseFirestore)
        let trimmed = org.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let needsLookup = trimmed.isEmpty || trimmed == "Organization" || trimmed == org.id || trimmed == (org.code ?? "")
        guard needsLookup else { return }
        let db = Firestore.firestore()
        let orgId = org.id

        func updateName(_ name: String?) {
            guard let name, !name.isEmpty else { return }
            if let index = orgs.firstIndex(where: { $0.id == orgId }) {
                orgs[index].name = name
            }
            if currentOrg?.id == orgId {
                currentOrg?.name = name
            }
        }
        func updateCode(_ code: String?) {
            guard let code, !code.isEmpty else { return }
            let normalized = normalizeOrgCode(code)
            if let index = orgs.firstIndex(where: { $0.id == orgId }) {
                if orgs[index].code != normalized {
                    orgs[index].code = normalized
                }
            }
            if currentOrg?.id == orgId {
                if currentOrg?.code != normalized {
                    currentOrg?.code = normalized
                    if let updated = currentOrg {
                        fetchOrgMembers(for: updated)
                        subscribeToMessages(for: updated)
                    }
                }
            }
        }

        db.collection("organizations").document(orgId).getDocument { [weak self] snapshot, _ in
            guard let self else { return }
            if let data = snapshot?.data() {
                let name = data["name"] as? String ?? data["orgName"] as? String ?? data["title"] as? String
                let code = data["access_code"] as? String ?? data["accessCode"] as? String ?? data["orgCode"] as? String
                updateName(name)
                updateCode(code)
                return
            }
            db.collection("orgs").document(orgId).getDocument { [weak self] snapshot, _ in
                guard let self else { return }
                let data = snapshot?.data()
                let name = data?["name"] as? String ?? data?["orgName"] as? String ?? data?["title"] as? String
                updateName(name)
                let code = data?["access_code"] as? String ?? data?["accessCode"] as? String ?? data?["orgCode"] as? String
                updateCode(code)
                self.fetchOrgNameFromUsers(accessCode: org.code, orgId: orgId, updateName: updateName, updateCode: updateCode)
            }
        }
        #endif
    }

    private func fetchOrgNameFromUsers(accessCode: String?, orgId: String, updateName: @escaping (String?) -> Void, updateCode: @escaping (String?) -> Void) {
        #if canImport(FirebaseFirestore)
        let db = Firestore.firestore()
        // Prefer a user with an active subscription/paid flag
        db.collection("users")
            .whereField("organizationId", isEqualTo: orgId)
            .whereField("paid", isEqualTo: true)
            .limit(to: 1)
            .getDocuments { snap, _ in
                if let doc = snap?.documents.first {
                    let data = doc.data()
                    let name = data["organizationName"] as? String ?? data["organization_name"] as? String
                    let code = data["accessCode"] as? String ?? data["access_code"] as? String
                    updateName(name)
                    updateCode(code)
                    return
                }

                if let accessCode, !accessCode.isEmpty {
                    db.collection("users").whereField("accessCode", isEqualTo: accessCode).limit(to: 1).getDocuments { snap, _ in
                        if let doc = snap?.documents.first {
                            let data = doc.data()
                            let name = data["organizationName"] as? String ?? data["organization_name"] as? String
                            let code = data["accessCode"] as? String ?? data["access_code"] as? String
                            updateName(name)
                            updateCode(code)
                            return
                        }
                        db.collection("users").whereField("organizationId", isEqualTo: orgId).limit(to: 1).getDocuments { snap, _ in
                            let data = snap?.documents.first?.data()
                            let name = data?["organizationName"] as? String ?? data?["organization_name"] as? String
                            let code = data?["accessCode"] as? String ?? data?["access_code"] as? String
                            updateName(name)
                            updateCode(code)
                        }
                    }
                } else {
                    db.collection("users").whereField("organizationId", isEqualTo: orgId).limit(to: 1).getDocuments { snap, _ in
                        let data = snap?.documents.first?.data()
                        let name = data?["organizationName"] as? String ?? data?["organization_name"] as? String
                        let code = data?["accessCode"] as? String ?? data?["access_code"] as? String
                        updateName(name)
                        updateCode(code)
                    }
                }
            }
        #endif
    }

    private func fetchOrgMembers(for org: OrgSummary) {
        #if canImport(FirebaseFirestore)
        let db = Firestore.firestore()
        let fields = [
            "orgId", "organizationId", "org_id", "organization_id",
            "linked_org_id", "linkedOrgId"
        ]
        let codeFields = [
            "orgCode", "org_code",
            "access_code", "accessCode", "org_access_code",
            "organizationCode", "organization_code"
        ]

        let group = DispatchGroup()
        var userOrgDocuments: [QueryDocumentSnapshot] = []
        var directUserDocuments: [QueryDocumentSnapshot] = []

        // 1. Fetch from user_organizations
        func runQuery(field: String, value: Any) {
            group.enter()
            db.collection("user_organizations").whereField(field, isEqualTo: value).getDocuments { snap, _ in
                if let docs = snap?.documents {
                    userOrgDocuments.append(contentsOf: docs)
                }
                group.leave()
            }
        }
        
        // 2. Fetch from users collection directly
        func runUserQuery(field: String, value: Any) {
            group.enter()
            db.collection("users").whereField(field, isEqualTo: value).getDocuments { snap, _ in
                if let docs = snap?.documents {
                    directUserDocuments.append(contentsOf: docs)
                }
                group.leave()
            }
        }

        for field in fields {
            runQuery(field: field, value: org.id)
            runUserQuery(field: field, value: org.id)
        }
        if let code = org.code {
            for field in codeFields {
                runQuery(field: field, value: code)
                runUserQuery(field: field, value: code)
                runUserQuery(field: field, value: code.lowercased()) // Safe measure
            }
        }
        let orgName = org.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !orgName.isEmpty {
            runUserQuery(field: "organizationName", value: orgName)
            runUserQuery(field: "organization_name", value: orgName)
        }

        group.notify(queue: .main) { [weak self] in
            guard let self else { return }
            var results: [VolunteerSummary] = []
            var userIds: [String] = []
            
            // Process user_organizations docs -> extract user IDs
            for doc in userOrgDocuments {
                let data = doc.data()
                let status = (data["status"] as? String)?.lowercased() ?? ""
                if status.contains("rejected") || status.contains("declined") || status.contains("removed") {
                    continue
                }
                let id =
                    data["user_id"] as? String ??
                    data["userId"] as? String ??
                    data["uid"] as? String ??
                    data["user"] as? String ??
                    data["memberId"] as? String
                if let id, !id.isEmpty {
                    userIds.append(id)
                }
            }
            
            // Process direct user docs -> extract VolunteerSummary directly
            for doc in directUserDocuments {
                let data = doc.data()
                let userId = doc.documentID
                // Skip myself
                if userId == self.currentUserId { continue }
                
                let first = data["firstName"] as? String ?? data["first_name"] as? String
                let last = data["lastName"] as? String ?? data["last_name"] as? String
                let display = data["displayName"] as? String ?? data["name"] as? String
                let email = data["email"] as? String
                let name = display ?? [first, last].compactMap { $0 }.joined(separator: " ")
                let finalName = name.isEmpty ? (email ?? "Volunteer") : name
                
                results.append(VolunteerSummary(id: userId, name: finalName))
            }

            let uniqueIds = Array(Set(userIds))
            let neededIds = uniqueIds.filter { uid in !results.contains(where: { $0.id == uid }) }

            if neededIds.isEmpty {
                // If we found everyone via users search, we are good.
                // Just dedupe results
                let uniqueUsers = Dictionary(grouping: results, by: { $0.id }).compactMap { $0.value.first }
                self.members = uniqueUsers.sorted { $0.name < $1.name }
                self.rebuildThreads()
                return
            }

            self.fetchUsers(for: neededIds, appendingTo: results)
        }
        #endif
    }

    private func fetchOrgsFromUserProfile(userId: String, existing: [OrgSummary]) {
        #if canImport(FirebaseFirestore)
        let db = Firestore.firestore()
        db.collection("users").document(userId).getDocument { [weak self] snapshot, _ in
            guard let self else { return }
            let data = snapshot?.data() ?? [:]
            
            // 1. Look for Arrays of IDs
            let orgIds =
                data["organizationIds"] as? [String] ??
                data["organization_ids"] as? [String] ??
                data["orgIds"] as? [String] ??
                data["org_ids"] as? [String] ??
                data["organizations"] as? [String] ??
                data["orgs"] as? [String] ??
                []

            // 2. Look for Single Code strings (e.g. "RWHS")
            var codes: [String] = []
            if let code = data["orgCode"] as? String { codes.append(code) }
            if let code = data["accessCode"] as? String { codes.append(code) }
            if let code = data["organizationCode"] as? String { codes.append(code) }
            if let code = data["org_code"] as? String { codes.append(code) }
            if let code = data["access_code"] as? String { codes.append(code) }

            if orgIds.isEmpty && codes.isEmpty {
                self.finalizeOrgs(existing)
                return
            }

            self.fetchOrgDocs(ids: orgIds, codes: codes, mergingWith: existing)
        }
        #else
        isLoading = false
        #endif
    }

    private func fetchOrgDocs(ids: [String], codes: [String], mergingWith existing: [OrgSummary]) {
        #if canImport(FirebaseFirestore)
        let db = Firestore.firestore()
        let group = DispatchGroup()
        
        // We will store found orgs here
        var foundOrgs: [OrgSummary] = []
        
        // 1. Fetch by IDs
        if !ids.isEmpty {
            let chunks = stride(from: 0, to: ids.count, by: 10).map { Array(ids[$0..<min($0 + 10, ids.count)]) }
            for chunk in chunks {
                group.enter()
                db.collection("organizations")
                    .whereField(FieldPath.documentID(), in: chunk)
                    .getDocuments { snap, _ in
                        let docs = snap?.documents ?? []
                        for doc in docs {
                            let data = doc.data()
                            let name = data["name"] as? String ?? data["orgName"] as? String ?? data["organizationName"] as? String ?? data["title"] as? String ?? "Organization"
                            let code = self.normalizeOrgCode(data["access_code"] ?? data["accessCode"] ?? data["orgCode"] ?? data["org_code"])
                            foundOrgs.append(OrgSummary(id: doc.documentID, code: code, name: name))
                        }
                        group.leave()
                    }
            }
        }
        
        // 2. Fetch by Codes (e.g. RWHS)
        // We attempt to find the real organization document to get the correct Name.
        // If we fail, we will fallback to creating a stub.
        let uniqueCodes = Array(Set(codes))
        for codeVal in uniqueCodes {
            let SEARCH_CODE = codeVal.trimmingCharacters(in: .whitespacesAndNewlines)
            if SEARCH_CODE.isEmpty { continue }

            group.enter()
            // Try fetching by access_code
            db.collection("organizations").whereField("access_code", isEqualTo: SEARCH_CODE).getDocuments { snap, _ in
                var found = false
                if let docs = snap?.documents, !docs.isEmpty {
                    found = true
                    for doc in docs {
                       let data = doc.data()
                       let name = data["name"] as? String ?? data["organizationName"] as? String ?? "Organization"
                       let c = self.normalizeOrgCode(data["access_code"] ?? data["accessCode"] ?? SEARCH_CODE)
                       foundOrgs.append(OrgSummary(id: doc.documentID, code: c, name: name))
                    }
                }
                
                if found {
                    group.leave()
                } else {
                    // Try fetch by orgCode
                    db.collection("organizations").whereField("orgCode", isEqualTo: SEARCH_CODE).getDocuments { snap2, _ in
                        if let docs2 = snap2?.documents, !docs2.isEmpty {
                            for doc in docs2 {
                               let data = doc.data()
                               let name = data["name"] as? String ?? data["organizationName"] as? String ?? "Organization"
                               let c = self.normalizeOrgCode(data["orgCode"] ?? SEARCH_CODE)
                               foundOrgs.append(OrgSummary(id: doc.documentID, code: c, name: name))
                            }
                        } else {
                             // If completely not found in DB, but User Profile has it -> Add as manual stub
                             // This ensures "RWHS" shows up even if no org doc exists
                             foundOrgs.append(OrgSummary(id: "stub-\(SEARCH_CODE)", code: SEARCH_CODE, name: SEARCH_CODE))
                        }
                        group.leave()
                    }
                }
            }
        }

        group.notify(queue: .main) { [weak self] in
            guard let self else { return }
            var all = existing
            // Add new ones if not present
            for item in foundOrgs {
                // Dedupe by ID or Code
                let alreadyHasId = all.contains(where: { $0.id == item.id })
                let alreadyHasCode = item.code != nil && all.contains(where: { $0.code == item.code })
                
                if !alreadyHasId && !alreadyHasCode {
                    all.append(item)
                }
            }
            
            self.finalizeOrgs(all)
        }
        #endif
    }
    
    private func finalizeOrgs(_ finalOrgs: [OrgSummary]) {
        self.orgs = finalOrgs
        // If current Org is nil, or invalid, select first
        if self.currentOrg == nil {
            if let first = finalOrgs.first {
                self.selectOrg(first)
            } else {
                self.threads = []
            }
        } else {
            // Re-select to refresh if needed, or just let it be
            if let cur = self.currentOrg, !finalOrgs.contains(where: { $0.id == cur.id }) {
                 // Current org no longer valid?
                 if let first = finalOrgs.first { self.selectOrg(first) }
            }
        }
        self.isLoading = false
    }

    private func fetchUsers(for ids: [String], appendingTo current: [VolunteerSummary] = []) {
        #if canImport(FirebaseFirestore)
        let db = Firestore.firestore()
        var results: [VolunteerSummary] = current
        let chunks = stride(from: 0, to: ids.count, by: 10).map { Array(ids[$0..<min($0 + 10, ids.count)]) }
        let group = DispatchGroup()

        for chunk in chunks {
            group.enter()
            db.collection("users")
                .whereField(FieldPath.documentID(), in: chunk)
                .getDocuments { snap, _ in
                    let docs = snap?.documents ?? []
                    for doc in docs {
                        let data = doc.data()
                        let first = data["firstName"] as? String ?? data["first_name"] as? String
                        let last = data["lastName"] as? String ?? data["last_name"] as? String
                        let display = data["displayName"] as? String ?? data["name"] as? String
                        let email = data["email"] as? String
                        let name = display ?? [first, last].compactMap { $0 }.joined(separator: " ")
                        let finalName = name.isEmpty ? (email ?? "Volunteer") : name
                        results.append(VolunteerSummary(id: doc.documentID, name: finalName))
                    }
                    group.leave()
                }
        }

        group.notify(queue: .main) { [weak self] in
            guard let self else { return }
            let unique = Dictionary(grouping: results, by: { $0.id }).compactMap { $0.value.first }
            self.members = unique.sorted { $0.name < $1.name }
            self.rebuildThreads()
        }
        #endif
    }

    private func normalizeOrgCode(_ value: Any?) -> String? {
        guard let raw = value else { return nil }
        let text = String(describing: raw).trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text.uppercased()
    }
}

struct MessageSnapshot: Hashable {
    let id: String
    let text: String
    let createdAt: Date?
    let senderId: String
    let senderName: String
    let threadId: String
    let orgId: String?
    let orgCode: String?
}

@available(iOS 15.0, *)
struct MessagesHomeView: View {
    @ObservedObject var viewModel: MessagesHomeViewModel

    init(viewModel: MessagesHomeViewModel) {
        self.viewModel = viewModel
    }

    var body: some View {
        NavigationStack(path: $viewModel.path) {
            ZStack {
                Color.white.ignoresSafeArea()

                if viewModel.isLoading {
                    ProgressView("Loading messages…")
                        .tint(.black)
                } else if viewModel.currentOrg == nil {
                    emptyState
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(viewModel.threads) { thread in
                                Button {
                                    viewModel.openThread(thread)
                                } label: {
                                    ThreadRow(thread: thread)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 12)
                        .padding(.bottom, 20)
                    }
                }
            }
            .navigationDestination(for: ThreadSummary.self) { thread in
                ChatThreadView(thread: thread, org: viewModel.currentOrg)
            }
        }
        .onAppear { viewModel.start() }
        .onDisappear { viewModel.stop() }
        .onChange(of: viewModel.path.count) { _ in
            viewModel.syncThreadState()
        }
        .sheet(isPresented: $viewModel.showOrgPicker) {
            OrgPickerSheet(orgs: viewModel.orgs, selected: viewModel.currentOrg) { org in
                viewModel.selectOrg(org)
                viewModel.showOrgPicker = false
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $viewModel.showAccount) {
            let summary = AccountSummaryProvider.current()
            AccountView(summary: summary, onDismiss: {
                viewModel.showAccount = false
            })
            .presentationDetents([.large])
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Text("No organizations yet")
                .font(.title3.weight(.semibold))
                .foregroundColor(.black)
            Text("Join an organization to see messages here.")
                .font(.callout)
                .foregroundColor(.black.opacity(0.6))
        }
        .multilineTextAlignment(.center)
        .padding()
    }
}

@available(iOS 15.0, *)
private struct ThreadRow: View {
    let thread: ThreadSummary

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(Color.black.opacity(0.08))
                .frame(width: 42, height: 42)
                .overlay(
                    Image(systemName: thread.isAllVolunteers ? "person.3.fill" : "person.fill")
                        .foregroundColor(.black)
                )

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(thread.title)
                        .font(.headline)
                        .foregroundColor(.black)
                    Spacer()
                    if let timestamp = thread.timestamp {
                        Text(formatTime(timestamp))
                            .font(.caption)
                            .foregroundColor(.black.opacity(0.5))
                    }
                }

                Text(thread.preview.isEmpty ? "No messages yet." : thread.preview)
                    .font(.subheadline)
                    .foregroundColor(.black.opacity(0.6))
                    .lineLimit(2)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white)
                .shadow(color: Color.black.opacity(0.05), radius: 6, x: 0, y: 3)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.black.opacity(0.06), lineWidth: 1)
        )
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

@available(iOS 15.0, *)
private struct OrgPickerSheet: View {
    let orgs: [OrgSummary]
    let selected: OrgSummary?
    var onSelect: (OrgSummary) -> Void

    var body: some View {
        NavigationStack {
            List(orgs) { org in
                Button {
                    onSelect(org)
                } label: {
                    HStack {
                        Text(org.name)
                            .foregroundColor(.black)
                        Spacer()
                        if org.id == selected?.id {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.black)
                        }
                    }
                }
            }
            .navigationTitle("Your Organizations")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

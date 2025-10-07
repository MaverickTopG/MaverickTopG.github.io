// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyC1kY4dlbg9v38ZkuYVPJGnSulMEouvw58",
    authDomain: "nexolink-b8eb5.firebaseapp.com",
    projectId: "nexolink-b8eb5",
    storageBucket: "nexolink-b8eb5.appspot.com",
    messagingSenderId: "247675121621",
    appId: "1:247675121621:web:98772b2e0cfbe8a381175c"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentAdmin = null;
let currentOrgCode = null;
let volunteersData = [];
let activityData = [];
let hoursChart = null;

// Authentication check - FIXED: redirect to signup.html instead of login.html
auth.onAuthStateChanged(async (user) => {
    // if (!user) {
    //     window.location.href = 'signup.html';
    //     return;
    // }

    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            await auth.signOut();
            window.location.href = 'signup.html';
            return;
        }

        currentAdmin = userDoc.data();
        currentOrgCode = currentAdmin.organizationCode;
        
        initializeDashboard();
    } catch (error) {
        console.error('Error checking authentication:', error);
        showMessage('Authentication error. Please try again.', 'error');
    }
});

// Initialize dashboard - FIXED: Added smooth loading transition
async function initializeDashboard() {
    try {
        // Add loading state
        document.body.classList.add('loading-dashboard');
        
        displayAdminInfo();
        await loadVolunteersData();
        await loadActivityData();
        updateStatistics();
        await initializeChart();
        setupDateControls();
        
        // Remove loading state with smooth transition
        setTimeout(() => {
            document.body.classList.remove('loading-dashboard');
        }, 500);
        
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showMessage('Error loading dashboard. Please refresh the page.', 'error');
    }
}

// Display admin information
function displayAdminInfo() {
    document.getElementById('userEmail').textContent = currentAdmin.email;
    document.getElementById('orgName').textContent = currentAdmin.organizationName || 'Organization';
    document.getElementById('orgCode').textContent = currentOrgCode;
}

// Load volunteers data - FIXED: Use only firstName
async function loadVolunteersData() {
    try {
        const usersQuery = await db.collection('users')
            .where('organizationCode', '==', currentOrgCode)
            .where('role', '==', 'volunteer')
            .get();

        const logsQuery = await db.collection('volunteer_logs')
            .where('organization_id', '==', currentOrgCode)
            .get();

        volunteersData = [];
        let volunteerHours = {};

        logsQuery.forEach(doc => {
            const log = doc.data();
            const userId = log.user_id;
            const hours = parseFloat(log.hours_contributed || log.hours) || 0;
            
            if (!volunteerHours[userId]) {
                volunteerHours[userId] = { totalHours: 0, lastActivity: null, logs: [] };
            }
            
            volunteerHours[userId].totalHours += hours;
            volunteerHours[userId].logs.push({ id: doc.id, ...log });
            
            if (!volunteerHours[userId].lastActivity || 
                new Date(log.date) > new Date(volunteerHours[userId].lastActivity)) {
                volunteerHours[userId].lastActivity = log.date;
            }
        });

        usersQuery.forEach(doc => {
            const userData = doc.data();
            const userId = doc.id;
            const hoursData = volunteerHours[userId] || { totalHours: 0, lastActivity: null, logs: [] };
            
            volunteersData.push({
                id: userId,
                firstName: userData.firstName || userData.name || '', // FIXED: Use firstName only
                email: userData.email || '',
                totalHours: hoursData.totalHours,
                lastActivity: hoursData.lastActivity,
                logs: hoursData.logs,
                registrationDate: userData.createdAt
            });
        });

        Object.keys(volunteerHours).forEach(userId => {
            if (!volunteersData.find(v => v.id === userId)) {
                const logs = volunteerHours[userId].logs;
                const email = logs[0]?.volunteer_email || logs[0]?.email || 'Unknown';
                
                volunteersData.push({
                    id: userId,
                    firstName: '', // FIXED: Only firstName
                    email: email,
                    totalHours: volunteerHours[userId].totalHours,
                    lastActivity: volunteerHours[userId].lastActivity,
                    logs: logs, 
                    registrationDate: null
                });
            }
        });

        displayVolunteers();
    } catch (error) {
        console.error('Error loading volunteers:', error);
        showMessage('Error loading volunteers data', 'error');
    }
}

// Load activity data
async function loadActivityData() {
    try {
        const logsQuery = await db.collection('volunteer_logs')
            .where('organization_id', '==', currentOrgCode)
            .orderBy('date', 'desc')
            .get();

        activityData = [];
        logsQuery.forEach(doc => {
            activityData.push({ id: doc.id, ...doc.data() });
        });

        displayActivity();
    } catch (error) {
        console.error('Error loading activity:', error);
        showMessage('Error loading activity data', 'error');
    }
}

// Update statistics
function updateStatistics() {
    const totalVolunteers = volunteersData.length;
    const totalHours = volunteersData.reduce((sum, v) => sum + v.totalHours, 0);
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyHours = activityData
        .filter(log => {
            const logDate = new Date(log.date);
            return logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear;
        })
        .reduce((sum, log) => sum + (parseFloat(log.hours_contributed || log.hours) || 0), 0);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weeklyActive = new Set(
        activityData
            .filter(log => new Date(log.date) >= oneWeekAgo)
            .map(log => log.user_id)
    ).size;

    // Animate numbers
    animateNumber('totalVolunteers', totalVolunteers);
    animateNumber('totalHours', totalHours, 1);
    animateNumber('monthlyHours', monthlyHours, 1);
    animateNumber('weeklyActive', weeklyActive);
}

// Animate number counters
function animateNumber(elementId, targetValue, decimals = 0) {
    const element = document.getElementById(elementId);
    const startValue = 0;
    const duration = 1500;
    const increment = targetValue / (duration / 16);
    let currentValue = startValue;

    const timer = setInterval(() => {
        currentValue += increment;
        if (currentValue >= targetValue) {
            currentValue = targetValue;
            clearInterval(timer);
        }
        element.textContent = decimals > 0 ? currentValue.toFixed(decimals) : Math.floor(currentValue);
    }, 16);
}

// Display volunteers in table - FIXED: Use only firstName
function displayVolunteers() {
    const tbody = document.getElementById('volunteersTableBody');
    tbody.innerHTML = '';

    volunteersData.forEach(volunteer => {
        const name = volunteer.firstName.trim() || 'Unknown'; // FIXED: Only firstName
        const lastActivity = volunteer.lastActivity ? 
            new Date(volunteer.lastActivity).toLocaleDateString() : 'Never';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${name}</td>
            <td>${volunteer.email}</td>
            <td><span class="hours-badge">${volunteer.totalHours.toFixed(1)} hrs</span></td>
            <td>${lastActivity}</td>
            <td>
                <button onclick="editVolunteerHours('${volunteer.id}')" class="btn-icon btn-edit" title="Edit Hours">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="viewVolunteerDetails('${volunteer.id}')" class="btn-icon btn-view" title="View Details">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Display activity logs - FIXED: Use only firstName
function displayActivity() {
    const activityList = document.getElementById('activityList');
    activityList.innerHTML = '';

    if (activityData.length === 0) {
        activityList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history"></i>
                <p>No recent activity found.</p>
            </div>
        `;
        return;
    }

    activityData.slice(0, 15).forEach(activity => {
        const volunteer = volunteersData.find(v => v.id === activity.user_id);
        const volunteerName = volunteer ? 
            volunteer.firstName || volunteer.email : // FIXED: Only firstName
            activity.volunteer_email || 'Unknown Volunteer';

        const hours = parseFloat(activity.hours_contributed || activity.hours) || 0;

        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        activityItem.innerHTML = `
            <div class="activity-content">
                <div class="activity-header">
                    <strong>${volunteerName}</strong>
                    <span class="activity-time">${new Date(activity.date).toLocaleDateString()}</span>
                </div>
                <div class="activity-description">
                    Logged <strong>${hours} hours</strong> at ${activity.site || 'No location'}
                </div>
            </div>
        `;
        activityList.appendChild(activityItem);
    });
}

// Initialize chart - FIXED: Beautiful gradient chart with better styling
async function initializeChart() {
    const ctx = document.getElementById('hoursChart').getContext('2d');
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
    document.getElementById('endDate').value = endDate.toISOString().split('T')[0];

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(255, 179, 71, 0.85)');
    gradient.addColorStop(0.5, 'rgba(255, 139, 107, 0.45)');
    gradient.addColorStop(1, 'rgba(255, 111, 178, 0.14)');

    const borderGradient = ctx.createLinearGradient(0, 0, 0, 400);
    borderGradient.addColorStop(0, '#ffb347');
    borderGradient.addColorStop(1, '#ff8b6b');

    hoursChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Hours Logged',
                data: [],
                backgroundColor: gradient,
                borderColor: borderGradient,
                borderWidth: 4,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#ffb347',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 3,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: '#ff8b6b',
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 3,
                shadowOffsetX: 0,
                shadowOffsetY: 4,
                shadowBlur: 10,
                shadowColor: 'rgba(255, 139, 107, 0.3)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 2000,
                easing: 'easeInOutQuart'
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#ffb347',
                    borderWidth: 2,
                    cornerRadius: 10,
                    displayColors: false,
                    callbacks: {
                        title: function(context) {
                            return 'Date: ' + context[0].label;
                        },
                        label: function(context) {
                            return 'Hours: ' + context.parsed.y.toFixed(1);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 179, 71, 0.16)',
                        lineWidth: 1
                    },
                    ticks: {
                        color: '#666',
                        font: {
                            size: 12,
                            weight: '500'
                        },
                        callback: function(value) {
                            return value + ' hrs';
                        }
                    },
                    title: {
                        display: true,
                        text: 'Hours',
                        color: '#333',
                        font: {
                            size: 14,
                            weight: '600'
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#666',
                        font: {
                            size: 12,
                            weight: '500'
                        },
                        maxTicksLimit: 10
                    },
                    title: {
                        display: true,
                        text: 'Date',
                        color: '#333',
                        font: {
                            size: 14,
                            weight: '600'
                        }
                    }
                }
            }
        }
    });

    await updateChart();
}

// Update chart with selected date range - FIXED: Better data processing
async function updateChart() {
    const startDate = new Date(document.getElementById('startDate').value);
    const endDate = new Date(document.getElementById('endDate').value);
    
    if (startDate > endDate) {
        showMessage('Start date must be before end date', 'error');
        return;
    }

    const filteredLogs = activityData.filter(log => {
        const logDate = new Date(log.date);
        return logDate >= startDate && logDate <= endDate;
    });

    // Group by date and sum hours
    const dateHours = {};
    filteredLogs.forEach(log => {
        const date = new Date(log.date).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
        });
        const hours = parseFloat(log.hours_contributed || log.hours) || 0;
        dateHours[date] = (dateHours[date] || 0) + hours;
    });

    // Sort dates chronologically
    const sortedEntries = Object.entries(dateHours).sort((a, b) => {
        return new Date(a[0]) - new Date(b[0]);
    });

    const dates = sortedEntries.map(entry => entry[0]);
    const hours = sortedEntries.map(entry => entry[1]);

    // Update chart with animation
    hoursChart.data.labels = dates;
    hoursChart.data.datasets[0].data = hours;
    hoursChart.update('active');

    showMessage(`Chart updated with ${dates.length} data points`, 'success');
}

// Setup date controls
function setupDateControls() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('endDate').max = today;
}

// Edit volunteer hours - FIXED: Use only firstName
function editVolunteerHours(volunteerId) {
    const volunteer = volunteersData.find(v => v.id === volunteerId);
    if (!volunteer) return;

    const modal = document.getElementById('editHoursModal');
    const content = document.getElementById('editHoursContent');
    
    const name = volunteer.firstName || volunteer.email; // FIXED: Only firstName
    
    content.innerHTML = `
        <div class="volunteer-header">
            <h4>${name}</h4>
            <p>${volunteer.email} - Total: ${volunteer.totalHours.toFixed(1)} hours</p>
        </div>
        
        <div class="volunteer-logs">
            <h5>Activity Logs</h5>
            <div id="editableLogsList">
                ${volunteer.logs.length > 0 ? volunteer.logs.map(log => `
                    <div class="log-item" data-log-id="${log.id}">
                        <div class="log-inputs">
                            <input type="date" value="${log.date}" data-field="date">
                            <input type="text" value="${log.site || ''}" placeholder="Location" data-field="site">
                            <input type="number" value="${log.hours_contributed || log.hours || 0}" 
                                   step="0.1" min="0" placeholder="Hours" data-field="hours">
                            <button onclick="deleteLog('${log.id}', '${volunteerId}')" class="btn-danger btn-sm">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `).join('') : '<p>No activity logs found</p>'}
            </div>
            <button onclick="addNewLog('${volunteerId}')" class="btn-success">Add New Log</button>
        </div>
        <div class="modal-footer">
            <button onclick="saveVolunteerHours('${volunteerId}')" class="btn-primary">Save Changes</button>
            <button onclick="closeEditModal()" class="btn-outline">Cancel</button>
        </div>
    `;
    
    modal.style.display = 'block';
}

// Save volunteer hours changes
async function saveVolunteerHours(volunteerId) {
    try {
        const logItems = document.querySelectorAll('#editableLogsList .log-item');
        const updates = [];

        for (const item of logItems) {
            const logId = item.dataset.logId;
            if (!logId || logId === 'new') continue;
            
            const inputs = item.querySelectorAll('input');
            const logData = {};
            
            inputs.forEach(input => {
                const field = input.dataset.field;
                let value = input.value;
                
                if (field === 'hours') {
                    value = parseFloat(value) || 0;
                    logData.hours_contributed = value;
                    logData.hours = value;
                } else {
                    logData[field] = value;
                }
            });

            updates.push(db.collection('volunteer_logs').doc(logId).update(logData));
        }

        await Promise.all(updates);
        showMessage('Hours updated successfully', 'success');
        closeEditModal();
        await loadVolunteersData();
        await loadActivityData();
        updateStatistics();
        updateChart();
        
    } catch (error) {
        console.error('Error saving hours:', error);
        showMessage('Error saving changes', 'error');
    }
}

// Add new log entry
function addNewLog(volunteerId) {
    const logsList = document.getElementById('editableLogsList');
    const newLogDiv = document.createElement('div');
    newLogDiv.className = 'log-item new-log';
    newLogDiv.dataset.logId = 'new';
    
    const today = new Date().toISOString().split('T')[0];
    newLogDiv.innerHTML = `
        <div class="log-inputs">
            <input type="date" value="${today}" data-field="date">
            <input type="text" placeholder="Location" data-field="site">
            <input type="number" step="0.1" min="0" placeholder="Hours" data-field="hours">
            <button onclick="createNewLog('${volunteerId}', this.parentElement.parentElement)" class="btn-success btn-sm">
                <i class="fas fa-check"></i>
            </button>
            <button onclick="this.parentElement.parentElement.remove()" class="btn-outline btn-sm">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    logsList.appendChild(newLogDiv);
}

// Create new log entry
async function createNewLog(volunteerId, logElement) {
    try {
        const inputs = logElement.querySelectorAll('input');
        const logData = {
            user_id: volunteerId,
            organization_id: currentOrgCode,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        };

        inputs.forEach(input => {
            const field = input.dataset.field;
            let value = input.value;
            
            if (field === 'hours') {
                value = parseFloat(value) || 0;
                logData.hours_contributed = value;
                logData.hours = value;
            } else {
                logData[field] = value;
            }
        });

        const docRef = await db.collection('volunteer_logs').add(logData);
        logElement.dataset.logId = docRef.id;
        logElement.classList.remove('new-log');
        
        const actionsDiv = logElement.querySelector('.log-inputs');
        actionsDiv.innerHTML = actionsDiv.innerHTML.replace(
            /onclick="createNewLog[^ vital]*"/g, 
            `onclick="deleteLog('${docRef.id}', '${volunteerId}')"`
        ).replace('<i class="fas fa-check"></i>', '<i class="fas fa-trash"></i>')
         .replace('btn-success', 'btn-danger')
         .replace(/onclick="this.parentElement.parentElement.remove()"/g, '');
        
        showMessage('New log entry added', 'success');
        
    } catch (error) {
        console.error('Error creating log:', error);
        showMessage('Error creating log entry', 'error');
    }
}

// Delete log entry
async function deleteLog(logId, volunteerId) {
    if (!confirm('Are you sure you want to delete this log entry?')) return;

    try {
        await db.collection('volunteer_logs').doc(logId).delete();
        showMessage('Log entry deleted', 'success');
        document.querySelector(`[data-log-id="${logId}"]`).remove();
    } catch (error) {
        console.error('Error deleting log:', error);
        showMessage('Error deleting log entry', 'error');
    }
}

// Close edit modal
function closeEditModal() {
    document.getElementById('editHoursModal').style.display = 'none';
}

// View volunteer details - FIXED: Use only firstName
function viewVolunteerDetails(volunteerId) {
    const volunteer = volunteersData.find(v => v.id === volunteerId);
    if (!volunteer) return;

    const name = volunteer.firstName || 'Unknown'; // FIXED: Only firstName
    const registrationDate = volunteer.registrationDate ? 
        new Date(volunteer.registrationDate.toDate()).toLocaleDateString() : 'Unknown';

    alert(`Volunteer Details:\n\nName: ${name}\nEmail: ${volunteer.email}\nTotal Hours: ${volunteer.totalHours.toFixed(1)}
Last Activity: ${volunteer.lastActivity || 'Never'}
Registered: ${registrationDate}
Total Logs: ${volunteer.logs.length}`);
}

// Download chart
async function downloadChart(format) {
    const chartCanvas = document.getElementById('hoursChart');
    
    if (format === 'pdf') {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();
        
        const imgData = chartCanvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 10, 10, 190, 100);
        
        pdf.setFontSize(16);
        pdf.text('Volunteer Hours Report', 10, 130);
        pdf.setFontSize(12);
        pdf.text(`Organization: ${currentAdmin.organizationName || 'Unknown'}`, 10, 145);
        pdf.text(`Total Volunteers: ${volunteersData.length}`, 10, 155);
        pdf.text(`Total Hours: ${volunteersData.reduce((sum, v) => sum + v.totalHours, 0).toFixed(1)}`, 10, 165);
        pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 10, 175);
        
        pdf.save(`volunteer-hours-report-${new Date().toISOString().split('T')[0]}.pdf`);
        showMessage('Report downloaded successfully', 'success');
    }
}

// Filter volunteers
function filterVolunteers() {
    const searchTerm = document.getElementById('searchVolunteer').value.toLowerCase();
    const rows = document.querySelectorAll('#volunteersTableBody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// Sort volunteers - FIXED: Use only firstName
function sortVolunteers() {
    const sortBy = document.getElementById('sortBy').value;
    
    volunteersData.sort((a, b) => {
        switch (sortBy) {
            case 'name':
                const nameA = a.firstName || a.email; // FIXED: Only firstName
                const nameB = b.firstName || b.email; // FIXED: Only firstName
                return nameA.localeCompare(nameB);
            case 'hours':
                return b.totalHours - a.totalHours;
            case 'recent':
                const dateA = a.lastActivity ? new Date(a.lastActivity) : new Date(0);
                const dateB = b.lastActivity ? new Date(b.lastActivity) : new Date(0);
                return dateB - dateA;
            default:
                return 0;
        }
    });
    
    displayVolunteers();
}

// Filter activity - FIXED: Use only firstName
function filterActivity() {
    const filter = document.getElementById('activityFilter').value;
    let filteredData = [...activityData];
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    switch (filter) {
        case 'today':
            filteredData = activityData.filter(log => new Date(log.date) >= today);
            break;
        case 'week':
            filteredData = activityData.filter(log => new Date(log.date) >= weekAgo);
            break;
        case 'month':
            filteredData = activityData.filter(log => new Date(log.date) >= monthAgo);
            break;
    }
    
    // Display filtered activity
    const activityList = document.getElementById('activityList');
    activityList.innerHTML = '';
    
    if (filteredData.length === 0) {
        activityList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history"></i>
                <p>No activity found for the selected period.</p>
            </div>
        `;
        return;
    }

    filteredData.slice(0, 15).forEach(activity => {
        const volunteer = volunteersData.find(v => v.id === activity.user_id);
        const volunteerName = volunteer ? 
            volunteer.firstName || volunteer.email : // FIXED: Only firstName
            activity.volunteer_email || 'Unknown Volunteer';

        const hours = parseFloat(activity.hours_contributed || activity.hours) || 0;

        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        activityItem.innerHTML = `
            <div class="activity-content">
                <div class="activity-header">
                    <strong>${volunteerName}</strong>
                    <span class="activity-time">${new Date(activity.date).toLocaleDateString()}</span>
                </div>
                <div class="activity-description">
                    Logged <strong>${hours} hours</strong> at ${activity.site || 'No location'}
                </div>
            </div>
        `;
        activityList.appendChild(activityItem);
    });
}

// Export activity log - FIXED: Use only firstName
function exportActivityLog() {
    const filter = document.getElementById('activityFilter').value;
    let dataToExport = [...activityData];
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    switch (filter) {
        case 'today':
            dataToExport = activityData.filter(log => new Date(log.date) >= today);
            break;
        case 'week':
            dataToExport = activityData.filter(log => new Date(log.date) >= weekAgo);
            break;
        case 'month':
            dataToExport = activityData.filter(log => new Date(log.date) >= monthAgo);
            break;
    }
    
    // Create CSV content
    const headers = ['Date', 'Volunteer Name', 'Volunteer Email', 'Hours', 'Location'];
    let csvContent = headers.join(',') + '\n';
    
    dataToExport.forEach(log => {
        const volunteer = volunteersData.find(v => v.id === log.user_id);
        const volunteerName = volunteer ? 
            volunteer.firstName || volunteer.email : // FIXED: Only firstName
            log.volunteer_email || 'Unknown';
        const volunteerEmail = volunteer ? volunteer.email : log.volunteer_email || 'Unknown';
        
        const row = [
            log.date || '',
            `"${volunteerName}"`, // Corrected: escaped quotes within template literal
            volunteerEmail,
            log.hours_contributed || log.hours || 0,
            `"${log.site || ''}"` // Corrected: escaped quotes within template literal
        ];
        
        csvContent += row.join(',') + '\n';
    });
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `activity-log-${filter}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showMessage('Activity log exported successfully', 'success');
}

// Logout function - FIXED: redirect to signup.html
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        auth.signOut().then(() => {
            window.location.href = 'signup.html'; // FIXED: redirect to signup.html
        }).catch((error) => {
            showMessage('Error logging out', 'error');
        });
    }
}

// Show message helper
function showMessage(message, type) {
    const container = document.getElementById('messageContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const icon = type === 'success' ? 'fas fa-check-circle' : 
                type === 'error' ? 'fas fa-exclamation-circle' : 
                'fas fa-info-circle';
    
    messageDiv.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" class="message-close">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(messageDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 5000);
}

// Handle window resize for chart
window.addEventListener('resize', () => {
    if (hoursChart) {
        hoursChart.resize();
    }
});

// Click outside modal to close
window.addEventListener('click', (e) => {
    const modal = document.getElementById('editHoursModal');
    if (e.target === modal) {
        closeEditModal();
    }
});

// Escape key to close modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeEditModal();
    }
});

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Copy, 
  Check,
  Send,
  Search,
  Book,
  MessageCircle,
  Bug,
  ChevronDown,
  ChevronUp,
  Mail,
  ExternalLink
} from 'lucide-react';

export const SupportPage: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<number | null>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBugForm, setShowBugForm] = useState(false);
  const [bugForm, setBugForm] = useState({ name: '', email: '', message: '' });

  const handleCopy = () => {
    navigator.clipboard.writeText('ayanshashish@gmail.com');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleQuestion = (id: number) => {
    setActiveQuestion(activeQuestion === id ? null : id);
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 50 } }
  };

  const faqs = [
    { 
      id: 1, 
      question: "How do I bulk upload volunteers?", 
      answer: "Navigate to the 'Volunteers' tab and click the 'Import' button in the top right corner. You can download our CSV template there, fill it out, and upload it back to the system." 
    },
    { 
      id: 2, 
      question: "Can I export reports to PDF?", 
      answer: "Yes! Click the 'Export' icon in the global header bar (top right) to download current views as PDF, Excel, or CSV files." 
    },
    { 
      id: 3, 
      question: "How does the billing cycle work?", 
      answer: "We bill monthly on the 1st of every month. If you upgrade your plan mid-month, the cost is prorated for the remaining days." 
    },
    { 
      id: 4, 
      question: "Is there a mobile app for volunteers?", 
      answer: "Yes, volunteers can download the 'Volunteer Dash' companion app from the App Store or Google Play to sign up for shifts and log hours." 
    },
    {
      id: 5,
      question: "How do I reset my password?",
      answer: "Go to Settings > Security and click on 'Change Password'. If you cannot log in, use the 'Forgot Password' link on the login screen."
    }
  ];

  const docs = [
    { title: 'Impact Overview', content: 'Track weekly, monthly, and yearly volunteer activity, hours contributed, and busiest days.' },
    { title: 'Volunteer Requests', content: 'Approve or deny pending hour logs and volunteer join requests in real time.' },
    { title: 'Volunteers Directory', content: 'Search volunteers, view latest tasks, total hours, and archive or unarchive profiles.' },
    { title: 'Messaging', content: 'Message the entire group or specific volunteers with live, organization-wide threads.' },
    { title: 'Events', content: 'Create events, manage signups, track capacity, and view confirmed volunteers.' },
    { title: 'Transfer Data', content: 'Import CSV/XLSX volunteer logs, auto-create volunteers, and backfill historical hours.' },
    { title: 'Exports', content: 'Export data as Excel, PDF, or CSV reports directly from the header export menu.' },
    { title: 'Analytics Charts', content: 'Switch between weekly, monthly, and yearly charts and review past weeks.' },
    { title: 'Daily Goal', content: 'Monitor daily goal progress and adjust monthly hour targets.' },
    { title: 'QR Invite', content: 'Generate and download QR codes so volunteers can join quickly.' },
    { title: 'Notifications', content: 'View new volunteer requests and approve them from the header dropdown.' },
  ];

  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return docs;
    return docs.filter((doc) =>
      `${doc.title} ${doc.content}`.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full flex flex-col gap-6 mt-8 pb-10"
    >
      
      {/* Search & FAQs Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Search & FAQs */}
          <motion.div variants={item} className="lg:col-span-2 flex flex-col gap-6">
              
              {/* Search Bar */}
              <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
                  <h3 className="font-bold text-gray-900 text-lg mb-6">Search Documentation</h3>
                  <div className="relative group">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-lime-500 transition-colors" />
                      <input 
                          type="text" 
                          placeholder="e.g. How to create an event, billing..." 
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          className="w-full h-14 pl-12 pr-5 bg-gray-50 rounded-2xl border-none text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-lime-300 outline-none transition-all font-medium"
                      />
                  </div>
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredDocs.map((doc) => (
                      <div key={doc.title} className="rounded-2xl border border-gray-100 p-5 hover:border-gray-200 transition-colors">
                        <h4 className="font-bold text-gray-900 text-sm mb-2">{doc.title}</h4>
                        <p className="text-sm text-gray-500 leading-relaxed">{doc.content}</p>
                      </div>
                    ))}
                    {filteredDocs.length === 0 && (
                      <div className="text-sm text-gray-400">No documentation matches your search.</div>
                    )}
                  </div>
              </div>

              {/* FAQ Accordion */}
              <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
                  <h3 className="font-bold text-gray-900 text-lg mb-6">Frequently Asked Questions</h3>
                  <div className="flex flex-col gap-4">
                      {faqs.map((faq) => (
                          <div 
                            key={faq.id} 
                            className={`rounded-2xl border transition-all duration-300 overflow-hidden ${activeQuestion === faq.id ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100 hover:border-gray-200'}`}
                          >
                              <button 
                                onClick={() => toggleQuestion(faq.id)}
                                className="w-full px-6 py-4 flex items-center justify-between text-left"
                              >
                                  <span className={`font-bold transition-colors ${activeQuestion === faq.id ? 'text-gray-900' : 'text-gray-600'}`}>
                                    {faq.question}
                                  </span>
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${activeQuestion === faq.id ? 'bg-white shadow-sm' : 'bg-gray-100'}`}>
                                      {activeQuestion === faq.id ? (
                                          <ChevronUp className="w-4 h-4 text-gray-900" />
                                      ) : (
                                          <ChevronDown className="w-4 h-4 text-gray-500" />
                                      )}
                                  </div>
                              </button>
                              <AnimatePresence>
                                {activeQuestion === faq.id && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.3, ease: "easeInOut" }}
                                    >
                                        <div className="px-6 pb-6 pt-0 text-sm text-gray-500 leading-relaxed font-medium">
                                            {faq.answer}
                                        </div>
                                    </motion.div>
                                )}
                              </AnimatePresence>
                          </div>
                      ))}
                  </div>
              </div>

          </motion.div>

          {/* Right Column: Contact & Links */}
          <motion.div variants={item} className="flex flex-col gap-6">
              
              {/* Contact Card */}
              <div className="bg-lime-300 rounded-[2.5rem] p-8 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 rounded-full blur-2xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                  
                  <div className="relative z-10">
                      <div className="w-12 h-12 bg-white/40 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
                          <Mail className="w-6 h-6 text-gray-900" />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">Need help?</h3>
                      <p className="text-gray-800 font-medium mb-6 leading-tight">
                          Contact our lead developer directly for any technical issues.
                      </p>

                      <div className="bg-white/50 backdrop-blur-sm rounded-xl p-4 flex items-center justify-between gap-3 border border-white/40 mb-4">
                          <span className="text-sm font-bold text-gray-900 truncate">ayanshashish@gmail.com</span>
                          <button 
                              onClick={handleCopy}
                              className="p-2 hover:bg-white rounded-lg transition-colors text-gray-700 hover:text-gray-900"
                              title="Copy email"
                          >
                              {copied ? <Check className="w-4 h-4 text-green-700" /> : <Copy className="w-4 h-4" />}
                          </button>
                      </div>

                      <a 
                        href="mailto:ayanshashish@gmail.com"
                        className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                      >
                          <Send className="w-4 h-4" />
                          Send Email
                      </a>
                  </div>
              </div>

              {/* Quick Links */}
              <div className="bg-gray-900 rounded-[2.5rem] p-8 text-white shadow-sm">
                  <h3 className="font-bold text-lg mb-6">Resources</h3>
                  <div className="flex flex-col gap-3">
                      <button 
                        onClick={() => setShowBugForm(true)}
                        className="flex items-center justify-between p-4 bg-gray-800 hover:bg-gray-700 rounded-2xl transition-colors group"
                      >
                          <div className="flex items-center gap-3">
                              <Bug className="w-5 h-5 text-gray-400 group-hover:text-red-400 transition-colors" />
                              <span className="font-bold text-sm">Report a Bug</span>
                          </div>
                          <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                      </button>
                  </div>
              </div>

          </motion.div>

      </div>

      {/* Bug Report Modal */}
      <AnimatePresence>
        {showBugForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowBugForm(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md relative shadow-2xl z-10"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">Report a Bug</h3>
              <p className="text-sm text-gray-500 mb-6">Send details to the team.</p>
              <div className="flex flex-col gap-4">
                <input
                  type="text"
                  placeholder="Your name"
                  value={bugForm.name}
                  onChange={(event) => setBugForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full h-12 px-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-lime-300 outline-none"
                />
                <input
                  type="email"
                  placeholder="Email address"
                  value={bugForm.email}
                  onChange={(event) => setBugForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="w-full h-12 px-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-lime-300 outline-none"
                />
                <textarea
                  placeholder="Describe the issue..."
                  value={bugForm.message}
                  onChange={(event) => setBugForm((prev) => ({ ...prev, message: event.target.value }))}
                  className="w-full min-h-[120px] px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-lime-300 outline-none resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowBugForm(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowBugForm(false)}
                  className="px-5 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-black"
                >
                  Submit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

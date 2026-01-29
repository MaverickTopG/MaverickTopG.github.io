import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Upload, MessageSquare, Calendar, Layout, Zap } from 'lucide-react';

export const WhatsNewPage: React.FC = () => {
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

  const features = [
    {
      title: "Refreshed UI",
      description: "A completely redesigned interface focusing on clarity, speed, and aesthetics. We've removed the clutter to help you focus on what matters most—your impact.",
      icon: <Layout className="w-8 h-8 text-white" />,
      color: "bg-gray-900",
      textColor: "text-white",
      span: "col-span-1 md:col-span-2",
      image: "linear-gradient(to bottom right, #111827, #1F2937)" 
    },
    {
      title: "Upload Hours",
      description: "Bulk import volunteer hours from Excel or CSV files. Our smart validation ensures your data is accurate before it hits the database.",
      icon: <Upload className="w-6 h-6 text-gray-900" />,
      color: "bg-lime-300",
      textColor: "text-gray-900",
      span: "col-span-1",
      image: null
    },
    {
      title: "Messaging System",
      description: "Real-time chat with volunteers. Create groups, send announcements, and keep everyone in the loop without leaving the dashboard.",
      icon: <MessageSquare className="w-6 h-6 text-blue-600" />,
      color: "bg-white",
      textColor: "text-gray-900",
      span: "col-span-1",
      image: null
    },
    {
      title: "Events Management",
      description: "Comprehensive event planning tools. Schedule shifts, assign roles, and track attendance all in one place.",
      icon: <Calendar className="w-6 h-6 text-purple-600" />,
      color: "bg-white",
      textColor: "text-gray-900",
      span: "col-span-1 md:col-span-2",
      image: null
    }
  ];

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full flex flex-col gap-8 mt-8 pb-10"
    >
      
      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {features.map((feature, idx) => (
            <motion.div 
                key={idx}
                variants={item}
                className={`${feature.span} ${feature.color} rounded-[2.5rem] p-8 md:p-10 relative overflow-hidden group shadow-sm border border-gray-100/50 transition-all hover:shadow-xl`}
                style={feature.image ? { background: feature.image } : {}}
            >
                {/* Hover Effect Background */}
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                <div className="relative z-10 flex flex-col h-full items-start justify-start gap-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm ${feature.textColor === 'text-white' ? 'bg-white/10' : 'bg-gray-50'}`}>
                        {feature.icon}
                    </div>
                    
                    <div>
                        <h3 className={`text-2xl font-bold mb-3 ${feature.textColor}`}>{feature.title}</h3>
                        <p className={`text-lg font-medium leading-relaxed ${feature.textColor === 'text-white' ? 'text-gray-400' : 'text-gray-500'}`}>
                            {feature.description}
                        </p>
                    </div>
                </div>
            </motion.div>
        ))}
      </div>

    </motion.div>
  );
};
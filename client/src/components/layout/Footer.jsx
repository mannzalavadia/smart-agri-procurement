import React from 'react';
import { Sprout, ShieldCheck, Heart } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="bg-slate-900 text-slate-400 mt-auto border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2.5 text-white font-bold text-lg mb-3">
              <div className="w-8 h-8 rounded-lg gradient-agri flex items-center justify-center text-white">
                <Sprout className="w-5 h-5" />
              </div>
              <span>AgriProcure</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              {t('app_tagline')}. Dedicated to modernizing agricultural procurement with fair prices and transparent queues.
            </p>
          </div>

          <div>
            <h4 className="text-white text-sm font-bold uppercase tracking-wider mb-3">Key Features</h4>
            <ul className="text-sm space-y-2">
              <li className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Verified Mandi & Center Directory
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Atomic Dual-Capacity Slot Booking
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                QR Token Check-In & Live Queue
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Hindi & English Bilingual UI
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white text-sm font-bold uppercase tracking-wider mb-3">Academic Notice</h4>
            <p className="text-xs text-slate-400 leading-relaxed bg-slate-800/60 p-3 rounded-lg border border-slate-700">
              This application uses synthetic test data (Lucknow region) and simulates procurement workflows. No actual financial transactions or government MSP integrations are processed.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© 2026 Smart Agricultural Procurement System. College Final Year Project.</p>
          <p className="flex items-center gap-1">
            Engineered with <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" /> for Indian Farmers
          </p>
        </div>
      </div>
    </footer>
  );
}

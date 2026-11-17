import React from 'react';
import { Link } from 'react-router-dom';
import { Sprout, Building2, Shield, CalendarCheck, Clock, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';

export function HomePage() {
  const { t } = useLanguage();
  const { isAuthenticated, role } = useAuth();

  const getDashboardPath = () => {
    if (role === 'admin') return '/admin';
    if (role === 'operator') return '/operator';
    return '/farmer';
  };

  return (
    <div className="space-y-16 py-8 md:py-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl gradient-agri text-white px-6 py-16 md:px-16 md:py-20 shadow-xl shadow-agri-950/20">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
        <div className="relative max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold tracking-wide uppercase text-emerald-200 border border-white/20">
            <Sparkles className="w-3.5 h-3.5 text-harvest-300" />
            <span>Smart Mandi Queue Automation</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
            {t('home.hero_title')}
          </h1>

          <p className="text-base md:text-lg text-emerald-100 font-medium leading-relaxed">
            {t('home.hero_subtitle')}
          </p>

          <div className="pt-4 flex flex-wrap items-center gap-4">
            {isAuthenticated ? (
              <Link
                to={getDashboardPath()}
                className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-white text-agri-900 font-extrabold hover:bg-emerald-50 transition-all shadow-lg shadow-black/20"
              >
                <span>Go to {t('nav.dashboard')}</span>
                <ArrowRight className="w-5 h-5 text-agri-700" />
              </Link>
            ) : (
              <>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-harvest-500 text-slate-900 font-black hover:bg-harvest-400 transition-all shadow-lg shadow-harvest-950/30"
                >
                  <Sprout className="w-5 h-5" />
                  <span>{t('home.cta_farmer')}</span>
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold backdrop-blur-md border border-white/20 transition-all"
                >
                  <span>{t('nav.login')}</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 3 Core Value Pillars */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Pillar 1 */}
          <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">{t('home.feat_centers_title')}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{t('home.feat_centers_desc')}</p>
          </div>

          {/* Pillar 2 */}
          <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <CalendarCheck className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">{t('home.feat_booking_title')}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{t('home.feat_booking_desc')}</p>
          </div>

          {/* Pillar 3 */}
          <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">{t('home.feat_queue_title')}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{t('home.feat_queue_desc')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

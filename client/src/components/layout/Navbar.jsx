import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sprout, Globe, Menu, X, User, LogOut, LayoutDashboard, Shield, Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { NotificationBell } from '../notifications/NotificationBell';
import { DemoSimulatorModal } from '../demo/DemoSimulatorModal';

export function Navbar() {
  const { user, role, isAuthenticated, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getDashboardPath = () => {
    if (role === 'admin') return '/admin';
    if (role === 'operator') return '/operator';
    return '/farmer';
  };

  const getRoleBadge = () => {
    if (role === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
          <Shield className="w-3 h-3" /> {t('roles.admin')}
        </span>
      );
    }
    if (role === 'operator') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          <Building2 className="w-3 h-3" /> {t('roles.operator')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
        <Sprout className="w-3 h-3" /> {t('roles.farmer')}
      </span>
    );
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl gradient-agri flex items-center justify-center text-white shadow-md shadow-agri-900/20 group-hover:scale-105 transition-transform">
              <Sprout className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xl font-extrabold text-slate-900 tracking-tight group-hover:text-agri-700 transition-colors">
                AgriProcure
              </span>
              <span className="hidden sm:block text-[11px] font-semibold text-agri-700 uppercase tracking-wider">
                Smart Mandi Queue
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-sm font-semibold text-slate-700 hover:text-agri-700 transition-colors">
              {t('nav.home')}
            </Link>
            <Link to="/centers" className="text-sm font-semibold text-slate-700 hover:text-agri-700 transition-colors">
              {t('nav.centers')}
            </Link>
            <Link to="/how-it-works" className="text-sm font-semibold text-slate-700 hover:text-agri-700 transition-colors">
              {t('nav.how_it_works')}
            </Link>
          </nav>

          {/* Right Actions: Language Switcher & Auth */}
          <div className="hidden md:flex items-center gap-4">
            {/* Language Toggle Button */}
            <button
              onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-all shadow-xs"
              title="Toggle English / Hindi"
            >
              <Globe className="w-4 h-4 text-agri-600" />
              <span>{language === 'en' ? 'हिन्दी (HI)' : 'English (EN)'}</span>
            </button>

            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <Link
                  to={getDashboardPath()}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-agri-50 text-agri-800 border border-agri-200 text-sm font-bold hover:bg-agri-100 transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4 text-agri-700" />
                  <span>{t('nav.dashboard')}</span>
                </Link>

                <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                  <NotificationBell />
                  {getRoleBadge()}
                  <Link
                    to="/profile"
                    className="p-1.5 rounded-lg text-slate-600 hover:text-agri-700 hover:bg-slate-100 transition-colors"
                    title={t('nav.profile')}
                  >
                    <User className="w-5 h-5" />
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title={t('nav.logout')}
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="text-sm font-bold text-slate-700 hover:text-agri-700 px-3 py-2 transition-colors"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl gradient-agri text-white text-sm font-bold shadow-md shadow-agri-800/20 hover:opacity-95 hover:shadow-lg transition-all"
                >
                  <Sprout className="w-4 h-4" />
                  <span>{t('nav.register')}</span>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700"
            >
              {language === 'en' ? 'हिन्दी' : 'EN'}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-3">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-base font-semibold text-slate-800 hover:bg-slate-50"
          >
            {t('nav.home')}
          </Link>
          <Link
            to="/centers"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-base font-semibold text-slate-800 hover:bg-slate-50"
          >
            {t('nav.centers')}
          </Link>
          <Link
            to="/how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-base font-semibold text-slate-800 hover:bg-slate-50"
          >
            {t('nav.how_it_works')}
          </Link>

          <div className="pt-4 border-t border-slate-200 space-y-2">
            {isAuthenticated ? (
              <>
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">{user?.name}</span>
                  {getRoleBadge()}
                </div>
                <Link
                  to={getDashboardPath()}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-center px-4 py-2.5 rounded-xl bg-agri-600 text-white font-bold"
                >
                  {t('nav.dashboard')}
                </Link>
                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-center px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700"
                >
                  {t('nav.profile')}
                </Link>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="block w-full text-center px-4 py-2 rounded-xl text-red-600 font-bold hover:bg-red-50"
                >
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-800"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center px-4 py-2.5 rounded-xl bg-agri-600 text-white font-bold"
                >
                  {t('nav.register')}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sprout, Mail, Lock, User, Phone, MapPin, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

export function RegisterPage() {
  const { register } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    mobile: '',
    state: 'Uttar Pradesh',
    district: 'Lucknow',
    village: '',
    pincode: '',
    preferred_language: language,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    let sanitizedValue = value;

    // Disallow non-numeric characters for mobile and restrict to 10 digits
    if (name === 'mobile') {
      sanitizedValue = value.replace(/\D/g, '').slice(0, 10);
    }

    // Disallow non-numeric characters for pincode and restrict to 6 digits
    if (name === 'pincode') {
      sanitizedValue = value.replace(/\D/g, '').slice(0, 6);
    }

    setFormData((prev) => ({ ...prev, [name]: sanitizedValue }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Logical Validation Checks
    const trimmedName = formData.name.trim();
    if (trimmedName.length < 2 || !/^[a-zA-Z0-9\u0900-\u097F\s.\-']+$/.test(trimmedName)) {
      setError('Please enter a valid name (min 2 characters)');
      return;
    }

    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(formData.mobile)) {
      setError('Mobile number must be exactly 10 digits and start with 6, 7, 8, or 9');
      return;
    }

    if (formData.pincode && !/^[1-9]\d{5}$/.test(formData.pincode)) {
      setError('PIN code must be exactly 6 digits and cannot start with 0');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);

    try {
      await register({
        ...formData,
        name: trimmedName,
        district: formData.district.trim(),
        village: formData.village.trim(),
      });
      navigate('/farmer', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto my-8 p-4">
      <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-lg shadow-slate-200/50 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl gradient-agri text-white shadow-md shadow-agri-900/20 mb-2">
            <Sprout className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">{t('auth.register_title')}</h2>
          <p className="text-xs text-slate-500 font-medium">{t('auth.register_subtitle')}</p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                {t('auth.full_name')} *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-agri-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Mobile Number */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                {t('auth.mobile')} *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  name="mobile"
                  maxLength={10}
                  inputMode="numeric"
                  value={formData.mobile}
                  onChange={handleChange}
                  placeholder="10-digit mobile (e.g. 9876543210)"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-agri-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Email Address */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                {t('auth.email')} *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-agri-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                {t('auth.password')} *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Min 6 characters"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-agri-500 focus:outline-none"
                />
              </div>
            </div>

            {/* District */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                {t('auth.district')}
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  name="district"
                  value={formData.district}
                  onChange={handleChange}
                  placeholder="e.g. Lucknow"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-agri-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Village */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                {t('auth.village')}
              </label>
              <input
                type="text"
                name="village"
                value={formData.village}
                onChange={handleChange}
                placeholder="Village / Gram Panchayat"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-agri-500 focus:outline-none"
              />
            </div>

            {/* PIN Code */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                {t('auth.pincode')}
              </label>
              <input
                type="text"
                name="pincode"
                maxLength={6}
                inputMode="numeric"
                value={formData.pincode}
                onChange={handleChange}
                placeholder="6-digit PIN (e.g. 226001)"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-agri-500 focus:outline-none"
              />
            </div>

            {/* Preferred Language */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                {t('auth.preferred_lang')}
              </label>
              <select
                name="preferred_language"
                value={formData.preferred_language}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-agri-500 focus:outline-none bg-white font-medium"
              >
                <option value="en">English (EN)</option>
                <option value="hi">हिन्दी (Hindi - HI)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-3.5 px-4 rounded-xl gradient-agri text-white font-extrabold text-sm shadow-md shadow-agri-900/20 hover:opacity-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <>
                <span>{t('auth.btn_register')}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center text-xs text-slate-600">
          <span>{t('auth.have_account')} </span>
          <Link to="/login" className="font-extrabold text-agri-700 hover:underline">
            {t('nav.login')}
          </Link>
        </div>
      </div>
    </div>
  );
}

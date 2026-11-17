import React, { useState, useEffect } from 'react';
import { User, Phone, MapPin, Globe, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export function ProfilePage() {
  const { user, updateUserProfile } = useAuth();
  const { t, language, setLanguage } = useLanguage();

  const [formData, setFormData] = useState({
    name: user?.name || '',
    mobile: user?.profile?.mobile || '',
    district: user?.profile?.district || 'Lucknow',
    village: user?.profile?.village || '',
    pincode: user?.profile?.pincode || '',
    preferred_language: user?.preferred_language || language,
  });

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        mobile: user.profile?.mobile || '',
        district: user.profile?.district || 'Lucknow',
        village: user.profile?.village || '',
        pincode: user.profile?.pincode || '',
        preferred_language: user.preferred_language || language,
      });
    }
  }, [user, language]);

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
    setSuccessMsg('');
    setErrorMsg('');

    // Logical Validation Checks
    if (formData.name && formData.name.trim()) {
      const trimmedName = formData.name.trim();
      if (trimmedName.length < 2 || !/^[a-zA-Z0-9\u0900-\u097F\s.\-']+$/.test(trimmedName)) {
        setErrorMsg('Please enter a valid name (min 2 characters)');
        return;
      }
    }

    if (formData.mobile && formData.mobile.trim()) {
      const mobileRegex = /^[6-9]\d{9}$/;
      if (!mobileRegex.test(formData.mobile.trim())) {
        setErrorMsg('Mobile number must be exactly 10 digits and start with 6, 7, 8, or 9');
        return;
      }
    }

    if (formData.pincode && formData.pincode.trim()) {
      if (!/^[1-9]\d{5}$/.test(formData.pincode.trim())) {
        setErrorMsg('PIN code must be exactly 6 digits and cannot start with 0');
        return;
      }
    }

    setLoading(true);

    try {
      await updateUserProfile({
        ...formData,
        name: formData.name ? formData.name.trim() : '',
        district: formData.district ? formData.district.trim() : '',
        village: formData.village ? formData.village.trim() : '',
        pincode: formData.pincode ? formData.pincode.trim() : '',
      });
      setLanguage(formData.preferred_language);
      setSuccessMsg(t('profile.saved_success'));
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto my-8 p-4">
      <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-lg shadow-slate-200/40 space-y-6">
        <div className="border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">{t('profile.title')}</h2>
              <p className="text-xs text-slate-500 font-medium">{t('profile.subtitle')}</p>
            </div>
          </div>
        </div>

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                {t('auth.full_name')}
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-agri-500 focus:outline-none"
              />
            </div>

            {/* Email (Read Only) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                {t('auth.email')} (Immutable)
              </label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-sm cursor-not-allowed"
              />
            </div>

            {/* Mobile Number */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                {t('auth.mobile')}
              </label>
              <input
                type="tel"
                name="mobile"
                maxLength={10}
                inputMode="numeric"
                placeholder="10-digit mobile (e.g. 9876543210)"
                value={formData.mobile}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-agri-500 focus:outline-none"
              />
            </div>

            {/* District */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                {t('auth.district')}
              </label>
              <input
                type="text"
                name="district"
                value={formData.district}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-agri-500 focus:outline-none"
              />
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
                placeholder="6-digit PIN (e.g. 226001)"
                value={formData.pincode}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-agri-500 focus:outline-none"
              />
            </div>

            {/* Preferred Language */}
            <div className="space-y-1 sm:col-span-2">
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

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 py-3 px-6 rounded-xl gradient-agri text-white font-bold text-sm shadow-md hover:opacity-95 disabled:opacity-50 transition-all"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{t('profile.save_changes')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

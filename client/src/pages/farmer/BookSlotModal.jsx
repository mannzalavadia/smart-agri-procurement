import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Sprout, CheckCircle2, AlertCircle, ArrowRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { QRCodeDisplay } from '../../components/common/QRCodeSvg';
import { useLanguage } from '../../context/LanguageContext';

export function BookSlotModal({ center, onClose }) {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 10);

  const [date, setDate] = useState(defaultDate);
  const [slots, setSlots] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [selectedCropId, setSelectedCropId] = useState('');
  const [quantity, setQuantity] = useState('20');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  useEffect(() => {
    if (center.crops?.length > 0) {
      setSelectedCropId(center.crops[0].id || center.crops[0].crop_id);
    }
  }, [center]);

  useEffect(() => {
    async function loadSlots() {
      try {
        setLoadingSlots(true);
        setError('');
        const res = await api.get(`/slots/center/${center.id}?date=${date}`);
        if (res.data?.slots) {
          setSlots(res.data.slots);
          const firstOpen = res.data.slots.find((s) => s.is_bookable);
          if (firstOpen) {
            setSelectedSlotId(firstOpen.id);
          }
        }
      } catch (err) {
        setError('Failed to load slots for selected date');
      } finally {
        setLoadingSlots(false);
      }
    }

    if (center?.id && date) {
      loadSlots();
    }
  }, [center, date]);

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSlotId || !selectedCropId) return;

    const q = parseFloat(quantity);
    if (isNaN(q) || q <= 0 || q > 1000) {
      setError('Estimated quantity must be between 0.5 and 1000 quintals');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const payload = {
        centerId: center.id,
        slotId: selectedSlotId,
        cropId: selectedCropId,
        estimatedQuintals: q,
      };

      const res = await api.post('/bookings', payload);
      if (res.data?.success) {
        setConfirmedBooking({
          booking: res.data.booking,
          qrToken: res.data.qrToken,
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Booking reservation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCrop = center.crops?.find((c) => (c.id || c.crop_id) === selectedCropId);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>

        {confirmedBooking ? (
          /* Confirmation View with QR Token */
          <div className="text-center space-y-4 py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <h3 className="text-xl font-black text-slate-900">Appointment Confirmed!</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Your appointment has been reserved atomically. No manual approval required. Present your digital token at the center.
            </p>

            <div className="py-2 flex justify-center">
              <QRCodeDisplay
                token={confirmedBooking.qrToken}
                reference={confirmedBooking.booking.booking_reference}
                size={180}
              />
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs text-left space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Center:</span>
                <span className="font-bold text-slate-800">{center.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Reserved Crop:</span>
                <span className="font-bold text-slate-800">
                  {quantity} Quintals of {selectedCrop?.name_en || 'Crop'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Locked Rate:</span>
                <span className="font-extrabold text-agri-700">₹{confirmedBooking.booking.price_snapshot}/q</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onClose();
                  navigate('/farmer/bookings');
                }}
                className="py-2.5 px-4 rounded-xl gradient-agri text-white font-bold text-xs hover:opacity-95"
              >
                Go to My Bookings
              </button>
            </div>
          </div>
        ) : (
          /* Slot Selection & Booking Form */
          <>
            <div>
              <span className="text-[11px] font-bold text-agri-700 uppercase tracking-wider block">
                Instant Capacity-Controlled Booking
              </span>
              <h2 className="text-xl font-black text-slate-900">{center.name}</h2>
              <p className="text-xs text-slate-500">{center.address}, {center.district}</p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleBookingSubmit} className="space-y-4">
              {/* Crop & Quantity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Accepted Crop Variety *
                  </label>
                  <select
                    value={selectedCropId}
                    onChange={(e) => setSelectedCropId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                  >
                    {center.crops?.map((cr) => (
                      <option key={cr.id || cr.crop_id} value={cr.id || cr.crop_id}>
                        {language === 'hi' ? cr.name_hi : cr.name_en} (₹{cr.rate_per_quintal || cr.price_per_quintal}/q)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Estimated Quantity (q) *
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    max="1000"
                    step="0.5"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Date Selector */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Appointment Date *
                </label>
                <input
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800"
                />
              </div>

              {/* 30-Minute Time Slots Grid */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">
                    Available 30-Minute Slots
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    Limits: 10 farmers / 100 quintals per slot
                  </span>
                </div>

                {loadingSlots ? (
                  <div className="p-6 text-center text-xs text-slate-400">Loading open slots...</div>
                ) : slots.length === 0 ? (
                  <div className="p-4 text-center bg-slate-50 rounded-xl text-xs text-slate-500">
                    No operating slots available on this date (Center may be closed).
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                    {slots.map((s) => {
                      const timeStr = `${new Date(s.starts_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })} - ${new Date(s.ends_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`;

                      const isSelected = selectedSlotId === s.id;
                      const isFull = !s.is_bookable;

                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={isFull}
                          onClick={() => setSelectedSlotId(s.id)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            isFull
                              ? 'bg-slate-100 border-slate-200 opacity-40 cursor-not-allowed'
                              : isSelected
                              ? 'bg-agri-700 text-white border-agri-800 shadow-sm'
                              : 'bg-white border-slate-200 hover:border-agri-400'
                          }`}
                        >
                          <span className="text-[11px] font-bold block">{timeStr}</span>
                          <span className={`text-[10px] block ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                            {s.available_farmers} spots left ({s.available_quintals}q)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Price Snapshot & Total Banner */}
              {selectedCrop && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs flex items-center justify-between">
                  <span className="text-emerald-900 font-semibold">
                    Indicative Price Snapshot: ₹{selectedCrop.rate_per_quintal || selectedCrop.price_per_quintal}/q
                  </span>
                  <span className="text-emerald-950 font-black">
                    Est. Total: ₹{((selectedCrop.rate_per_quintal || selectedCrop.price_per_quintal || 0) * (parseFloat(quantity) || 0)).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedSlotId}
                  className="px-6 py-2.5 rounded-xl gradient-agri text-white text-xs font-extrabold shadow-md hover:opacity-95 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <span>Confirm & Reserve Slot</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

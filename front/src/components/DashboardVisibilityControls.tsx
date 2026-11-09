import { usePrefsStore } from '../store/prefs.store';

export const DASHBOARD_CARDS = [
  { id: 'alarm', label: 'Συναγερμός' },
  { id: 'weather', label: 'Καιρός' },
  { id: 'temperature', label: 'Θερμοκρασία σπιτιού' },
  { id: 'total-devices', label: 'Σύνολο συσκευών' },
  { id: 'online-devices', label: 'Σε σύνδεση' },
  { id: 'offline-devices', label: 'Εκτός σύνδεσης' },
  { id: 'rooms', label: 'Δωμάτια' },
];
export const DASHBOARD_SECTIONS = [
  { id: 'overview', label: 'Κάρτες επισκόπησης' },
  { id: 'devices', label: 'Οι συσκευές μου' },
  { id: 'stats', label: 'Στατιστικά' },
  { id: 'health', label: 'Κατάσταση σπιτιού' },
];

export default function DashboardVisibilityControls() {
  const {
    dashboardHiddenCards,
    dashboardHiddenSections,
    setDashboardHiddenCards,
    setDashboardHiddenSections,
    saving,
  } = usePrefsStore();
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#1A222C]">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        Εμφάνιση στην αρχική
      </p>
      {[
        {
          title: 'Ενότητες',
          items: DASHBOARD_SECTIONS,
          hidden: dashboardHiddenSections,
          save: setDashboardHiddenSections,
        },
        {
          title: 'Κάρτες',
          items: DASHBOARD_CARDS,
          hidden: dashboardHiddenCards,
          save: setDashboardHiddenCards,
        },
      ].map(({ title, items, hidden, save }) => (
        <fieldset key={title} disabled={saving}>
          <legend className="mb-2 text-xs font-medium text-slate-400">{title}</legend>
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 has-[:disabled]:cursor-wait has-[:disabled]:opacity-50 dark:border-white/10 dark:text-slate-300"
              >
                <input
                  type="checkbox"
                  checked={!hidden.includes(item.id)}
                  onChange={() =>
                    save(
                      hidden.includes(item.id)
                        ? hidden.filter((id) => id !== item.id)
                        : [...hidden, item.id],
                    )
                  }
                  className="accent-brand"
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="text-xs text-slate-400">
        Ξετσεκάρετε για απόκρυψη. Οι κρυφές κάρτες και ενότητες επανεμφανίζονται από εδώ,
        διατηρώντας τη σειρά τους.
      </p>
    </div>
  );
}

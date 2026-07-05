import { useEffect, useState } from 'react';
import { sb } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// Admin-only. Replaces the old "pin one party via localStorage" mechanism —
// that only ever moved a single alliance to the front, was per-browser, and
// had no explicit save step. This writes real sort_order values back to the
// alliances/parties tables (RLS: admin-write only, see schema.sql), so the
// order is the same for every viewer, on every device, immediately.
function DragList({ items, onReorder, renderLabel, colorKey }) {
  const [dragIndex, setDragIndex] = useState(null);

  const handleDrop = (dropIndex) => {
    if (dragIndex === null || dragIndex === dropIndex) return;
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    onReorder(next);
    setDragIndex(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item, i) => (
        <div
          key={item.code}
          draggable
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(i)}
          className="glass"
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            borderLeft: `3px solid ${item[colorKey] || 'var(--line)'}`,
            cursor: 'grab', opacity: dragIndex === i ? 0.4 : 1
          }}
        >
          <span style={{ color: 'var(--text-lo)' }}>⠿</span>
          <span style={{ fontSize: 13.5 }}>{renderLabel(item)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReorderPanel({ alliances, parties, onClose, onSaved }) {
  const { isAdmin } = useAuth();
  const { push } = useToast();
  const [allianceOrder, setAllianceOrder] = useState(alliances);
  const [partyOrder, setPartyOrder] = useState(parties);
  const [activeAlliance, setActiveAlliance] = useState(alliances[0]?.code || null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setAllianceOrder(alliances); }, [alliances]);
  useEffect(() => { setPartyOrder(parties); }, [parties]);

  const partiesInActive = partyOrder.filter(p => p.alliance_code === activeAlliance);

  const reorderPartiesWithin = (reordered) => {
    // Splice the reordered subset back into the full parties array, preserving
    // the relative order of parties belonging to other alliances.
    const others = partyOrder.filter(p => p.alliance_code !== activeAlliance);
    setPartyOrder([...others, ...reordered]);
  };

  const save = async () => {
    setBusy(true);
    try {
      // Alliances: sort_order = position in the dragged list
      await Promise.all(allianceOrder.map((a, i) =>
        sb.from('alliances').update({ sort_order: i + 1 }).eq('code', a.code)
      ));

      // Parties: within each alliance, sort_order follows drag order;
      // recompute per-alliance so numbers stay small/readable (1,2,3…).
      const byAlliance = {};
      partyOrder.forEach(p => { (byAlliance[p.alliance_code] ??= []).push(p); });
      const updates = [];
      Object.values(byAlliance).forEach(list => {
        list.forEach((p, i) => updates.push(
          sb.from('parties').update({ sort_order: i + 1 }).eq('code', p.code)
        ));
      });
      await Promise.all(updates);

      push('Order saved — everyone sees this now', 'success');
      onSaved?.();
      onClose();
    } catch (e) {
      push(e.message || 'Failed to save order (admin only)', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div className="modal-surface" style={{ width: 640, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: '0 0 auto' }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Reorder alliances & parties</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-mid)', marginTop: 4, flex: '0 0 auto' }}>
          Drag to reorder, then Save. This changes the order for every viewer, everywhere — not just your browser.
        </div>

        {/* Scrollable middle — however many alliances/parties exist, this area
            scrolls internally so the header above and Cancel/Save footer below
            always stay visible, never pushed off the bottom of the modal. */}
        <div className="scroll-thin" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', marginTop: 14, paddingRight: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Alliance order</div>
          <DragList
            items={allianceOrder}
            onReorder={setAllianceOrder}
            renderLabel={a => a.name}
            colorKey="color"
          />

          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 20, marginBottom: 6 }}>Party order within an alliance</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {allianceOrder.map(a => (
              <button key={a.code} className="btn btn-sm" onClick={() => setActiveAlliance(a.code)}
                style={{ background: activeAlliance === a.code ? a.color : 'var(--glass-hi)', color: activeAlliance === a.code ? '#fff' : 'var(--text-hi)' }}>
                {a.name}
              </button>
            ))}
          </div>
          <DragList
            items={partiesInActive}
            onReorder={reorderPartiesWithin}
            renderLabel={p => p.name}
            colorKey="color"
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flex: '0 0 auto' }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save order'}
          </button>
        </div>
      </div>
    </div>
  );
}

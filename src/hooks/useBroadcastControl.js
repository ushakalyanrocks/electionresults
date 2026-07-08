import { useEffect, useRef, useState } from 'react';
import { sb } from '../supabaseClient';

// Live subscription to the broadcast_control singleton. Used by the
// spotlight/district panels (read) and the ProducerPanel (read + write
// feedback). Realtime-first with a slow polling fallback, same defensive
// pattern as useElectionData.
export function useBroadcastControl() {
  const [control, setControl] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const load = async () => {
      const { data, error } = await sb.from('broadcast_control').select('*').eq('id', 1).maybeSingle();
      if (!error && mountedRef.current) setControl(data || null);
    };
    load();

    const channel = sb.channel('broadcast-control')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'broadcast_control' }, (payload) => {
        if (mountedRef.current && payload.new) setControl(payload.new);
      })
      .subscribe();

    const interval = setInterval(load, 20000); // fallback if realtime drops

    return () => {
      mountedRef.current = false;
      sb.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  return control;
}

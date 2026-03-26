import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAlarmStore } from '../store/alarm.store';

export type ArmAction = 'arm_home' | 'arm_away' | 'disarm';

export function useArmAlarm() {
  const { setSettings } = useAlarmStore();
  const queryClient = useQueryClient();
  const [pinPrompt, setPinPrompt] = useState<ArmAction | null>(null);
  const [pinError, setPinError] = useState('');
  const [countdown, setCountdown] = useState<{ mode: 'home' | 'away'; seconds: number; isExitDelay: boolean } | null>(null);

  const arm = useMutation({
    mutationFn: ({ mode, pin }: { mode: 'home' | 'away'; pin?: string }) =>
      api.post('/alarm/arm', { mode, pin }).then((r) => { setSettings(r.data); return r.data; }),
    onSuccess: (data, variables) => {
      setPinPrompt(null);
      setPinError('');
      if (variables.mode === 'away') {
        const delaySecs = data?.exitDelaySecs ?? 30;
        setCountdown({ mode: 'away', seconds: delaySecs, isExitDelay: true });
      } else {
        // Home arms instantly — show a brief 3s confirmation
        setCountdown({ mode: 'home', seconds: 3, isExitDelay: false });
      }
    },
    onError: (e: any) => setPinError(e?.response?.data?.message ?? 'Invalid PIN'),
  });

  const disarm = useMutation({
    mutationFn: (pin?: string) =>
      api.post('/alarm/disarm', { pin }).then((r) => { setSettings(r.data); return r.data; }),
    onSuccess: () => { setPinPrompt(null); setPinError(''); setCountdown(null); },
    onError: (e: any) => setPinError(e?.response?.data?.message ?? 'Invalid PIN'),
  });

  const handlePinConfirm = useCallback((pin: string) => {
    setPinError('');
    if (pinPrompt === 'disarm') disarm.mutate(pin);
    else if (pinPrompt === 'arm_home') arm.mutate({ mode: 'home', pin });
    else if (pinPrompt === 'arm_away') arm.mutate({ mode: 'away', pin });
  }, [pinPrompt, arm.mutate, disarm.mutate]);

  const startArm = useCallback((mode: 'home' | 'away', hasPinSet: boolean) => {
    setPinError('');
    if (hasPinSet) {
      setPinPrompt(mode === 'home' ? 'arm_home' : 'arm_away');
    } else {
      arm.mutate({ mode });
    }
  }, [arm.mutate]);

  const startDisarm = useCallback((hasPinSet: boolean) => {
    setPinError('');
    if (hasPinSet) {
      setPinPrompt('disarm');
    } else {
      disarm.mutate(undefined);
    }
  }, [disarm.mutate]);

  const handleCountdownDone = useCallback(() => {
    setCountdown(null);
    queryClient.invalidateQueries({ queryKey: ['alarm'] });
  }, [queryClient]);

  const handleCountdownCancel = useCallback(() => {
    setCountdown(null);
    disarm.mutate(undefined);
  }, []);

  return {
    pinPrompt,
    setPinPrompt,
    pinError,
    setPinError,
    countdown,
    arm,
    disarm,
    startArm,
    startDisarm,
    handlePinConfirm,
    handleCountdownDone,
    handleCountdownCancel,
    isPending: arm.isPending || disarm.isPending,
  };
}

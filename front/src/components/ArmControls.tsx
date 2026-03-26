import { Home, LogOut, ShieldOff } from 'lucide-react';
import { useArmAlarm } from '../hooks/useArmAlarm';
import PinPromptModal from './PinPromptModal';
import ArmCountdownModal from './ArmCountdownModal';

interface Props {
  currentState: string;
  hasPinSet: boolean;
}

export default function ArmControls({ currentState, hasPinSet }: Props) {
  const {
    pinPrompt, setPinPrompt, pinError,
    countdown, startArm, startDisarm,
    handlePinConfirm, handleCountdownDone, handleCountdownCancel,
    isPending,
  } = useArmAlarm();

  const isArmed = ['ARMED_HOME', 'ARMED_AWAY', 'ENTRY_DELAY', 'TRIGGERED'].includes(currentState);
  const isExitDelay = currentState === 'EXIT_DELAY';

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {isArmed || isExitDelay ? (
          <button
            onClick={() => startDisarm(hasPinSet)}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 text-sm text-slate-600 dark:text-slate-300 hover:border-red-400 hover:text-red-500 transition-colors disabled:opacity-40"
          >
            <ShieldOff size={15} /> Disarm
          </button>
        ) : (
          <>
            <button
              onClick={() => startArm('home', hasPinSet)}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium disabled:opacity-40 transition-colors"
            >
              <Home size={15} /> Arm Home
            </button>
            <button
              onClick={() => startArm('away', hasPinSet)}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium disabled:opacity-40 transition-colors"
            >
              <LogOut size={15} /> Arm Away
            </button>
          </>
        )}
      </div>

      {pinPrompt && (
        <PinPromptModal
          title={pinPrompt === 'disarm' ? 'Disarm Alarm' : pinPrompt === 'arm_home' ? 'Arm — Home' : 'Arm — Away'}
          description={hasPinSet ? 'Enter your PIN to confirm' : 'No PIN set — confirm to proceed'}
          onConfirm={hasPinSet ? handlePinConfirm : () => handlePinConfirm('')}
          onClose={() => setPinPrompt(null)}
          error={pinError}
          loading={isPending}
        />
      )}

      {countdown && (
        <ArmCountdownModal
          mode={countdown.mode}
          seconds={countdown.seconds}
          isExitDelay={countdown.isExitDelay}
          onClose={handleCountdownDone}
          onCancel={handleCountdownCancel}
        />
      )}
    </>
  );
}

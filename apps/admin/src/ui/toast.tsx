import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';

const Ctx = createContext<(text: string) => void>(() => {});

/** Short notice at the bottom (prototype `.toast`). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<number>();
  const toast = useCallback((t: string) => {
    setText(t);
    setShow(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), 2600);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className={`toast ${show ? 'show' : ''}`} role="status">
        {text}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SplashScreenProps {
    onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
    const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');

    useEffect(() => {
        // Hold the splash for 2.5 seconds then begin exit
        const holdTimer = setTimeout(() => setPhase('exit'), 2500);
        return () => clearTimeout(holdTimer);
    }, []);

    useEffect(() => {
        if (phase === 'exit') {
            // Allow exit animation to play then call onComplete
            const exitTimer = setTimeout(onComplete, 800);
            return () => clearTimeout(exitTimer);
        }
    }, [phase, onComplete]);

    return (
        <AnimatePresence>
            {phase !== 'exit' ? (
                <motion.div
                    key="splash"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6 }}
                    className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black overflow-hidden"
                >
                    {/* Animated background glow */}
                    <motion.div
                        className="absolute w-[600px] h-[600px] rounded-full"
                        style={{
                            background: 'radial-gradient(circle, rgba(34,197,94,0.15) 0%, rgba(0,0,0,0) 70%)',
                        }}
                        animate={{
                            scale: [1, 1.3, 1],
                            opacity: [0.5, 0.8, 0.5],
                        }}
                        transition={{
                            duration: 3,
                            repeat: Infinity,
                            ease: 'easeInOut',
                        }}
                    />

                    {/* Card suit decorations */}
                    <motion.div
                        className="absolute top-1/4 left-1/4 text-white/5 text-[200px] font-serif select-none"
                        initial={{ opacity: 0, rotate: -15 }}
                        animate={{ opacity: 1, rotate: 0 }}
                        transition={{ delay: 0.3, duration: 0.8 }}
                    >
                        ♠
                    </motion.div>
                    <motion.div
                        className="absolute bottom-1/4 right-1/4 text-red-500/5 text-[200px] font-serif select-none"
                        initial={{ opacity: 0, rotate: 15 }}
                        animate={{ opacity: 1, rotate: 0 }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                    >
                        ♥
                    </motion.div>

                    {/* Main title */}
                    <div className="relative z-10 flex flex-col items-center gap-6">
                        {/* Spade icon */}
                        <motion.div
                            className="text-7xl text-white"
                            initial={{ y: -40, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 120, damping: 12, delay: 0.2 }}
                        >
                            ♠
                        </motion.div>

                        {/* Title text */}
                        <motion.h1
                            className="text-6xl md:text-7xl font-black tracking-tight text-white text-center"
                            initial={{ y: 30, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.4, duration: 0.6 }}
                        >
                            <span className="bg-gradient-to-r from-white via-green-200 to-white bg-clip-text text-transparent">
                                Spades
                            </span>
                            <br />
                            <span className="text-3xl md:text-4xl font-light tracking-[0.3em] text-green-400/80">
                                LLM ARENA
                            </span>
                        </motion.h1>

                        {/* Subtitle */}
                        <motion.p
                            className="text-sm text-white/40 tracking-widest uppercase"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.8 }}
                        >
                            AI vs AI  •  Card Intelligence Benchmark
                        </motion.p>

                        {/* Loading bar */}
                        <motion.div
                            className="w-48 h-0.5 bg-white/10 rounded-full overflow-hidden mt-4"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1 }}
                        >
                            <motion.div
                                className="h-full bg-gradient-to-r from-green-500 to-green-300 rounded-full"
                                initial={{ width: '0%' }}
                                animate={{ width: '100%' }}
                                transition={{ delay: 1, duration: 1.5, ease: 'easeInOut' }}
                            />
                        </motion.div>
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
};

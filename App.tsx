import React from 'react';
import FluidCanvas from './components/FluidCanvas.tsx';
import { ArrowUpRight, Plus, Minus } from 'lucide-react';

function App() {
  return (
    <div className="w-screen h-screen bg-black text-white overflow-hidden font-sans selection:bg-emerald-500 selection:text-black">
      
      {/* 3D Background */}
      <FluidCanvas />

      {/* --- CORNER 1: TOP LEFT (Main Title Part 1) --- */}
      <div className="fixed top-0 left-0 p-8 md:p-16 z-20 pointer-events-none select-none">
        <div className="flex flex-col items-start">
          <span className="text-[10px] md:text-[12px] font-mono tracking-[0.2em] text-white/40 mb-2">
            FIG. 01 — INTELLIGENCE
          </span>
          {/* Removed negative translate to align strictly with the grid/padding line */}
          <h1 className="text-[15vw] leading-[0.8] font-bold tracking-tighter text-white mix-blend-exclusion">
            DEEP
          </h1>
        </div>
      </div>

      {/* --- CORNER 2: BOTTOM RIGHT (Main Title Part 2) --- */}
      <div className="fixed bottom-0 right-0 p-8 md:p-16 z-20 pointer-events-none select-none text-right">
        <div className="flex flex-col items-end">
           <h1 className="text-[15vw] leading-[0.8] font-bold tracking-tighter text-white mix-blend-exclusion">
            DATA
          </h1>
          <span className="text-[10px] md:text-[12px] font-mono tracking-[0.2em] text-white/40 mt-2">
            MARINE NEURAL NETWORK
          </span>
        </div>
      </div>

      {/* --- CORNER 3: TOP RIGHT (Navigation) --- */}
      <nav className="fixed top-0 right-0 p-8 md:p-16 z-30 flex flex-col items-end gap-6 pointer-events-auto">
        <div className="w-8 h-8 flex items-center justify-center border border-white/20 rounded-full mb-4 animate-spin-slow">
           <Plus className="w-4 h-4 text-white/60" />
        </div>
        
        {['WORK', 'AGENCY', 'CONTACT'].map((item, i) => (
            <a key={item} href="#" className="group relative flex items-center gap-4 text-[11px] font-bold tracking-[0.2em] text-white hover:text-emerald-400 transition-colors">
               <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <ArrowUpRight className="w-3 h-3" />
               </span>
               {item}
               <span className="absolute -bottom-2 right-0 w-0 h-[1px] bg-emerald-400 group-hover:w-full transition-all duration-300"></span>
            </a>
        ))}
      </nav>

      {/* --- CORNER 4: BOTTOM LEFT (Credits / EnzoKing) --- */}
      <div className="fixed bottom-0 left-0 p-8 md:p-16 z-30 pointer-events-auto">
         {/* Added items-start to ensure left alignment matches the top-left block */}
         <div className="group cursor-default flex flex-col items-start gap-4">
            
            {/* Technical Divider */}
            <div className="flex items-center gap-2">
               <div className="w-2 h-2 bg-white/20 group-hover:bg-emerald-500 transition-colors duration-500"></div>
               <div className="h-[1px] w-12 bg-white/20"></div>
            </div>

            <div className="flex flex-col items-start">
               <span className="text-[9px] font-mono tracking-[0.3em] text-white/40 uppercase mb-1 group-hover:text-emerald-500/80 transition-colors duration-300">
                  Design by
               </span>
               <h2 className="text-2xl md:text-3xl font-bold tracking-widest uppercase leading-none">
                  Enzo<span className="text-white/30 group-hover:text-white transition-colors duration-500">King</span>
               </h2>
               
               <div className="flex items-center gap-4 mt-2 opacity-50 group-hover:opacity-100 transition-opacity duration-500">
                  <span className="text-[9px] tracking-widest">EST. 2025</span>
                  <span className="text-[9px] tracking-widest text-emerald-500">•</span>
                  <span className="text-[9px] tracking-widest">IMMERSIVE WEB</span>
               </div>
            </div>
         </div>
      </div>

      {/* --- CENTER DECORATION (Subtle Grid Lines) --- */}
      <div className="fixed inset-0 pointer-events-none z-10 flex justify-center items-center">
         <div className="w-[1px] h-full bg-white/5"></div>
         <div className="h-[1px] w-full bg-white/5 absolute"></div>
      </div>

    </div>
  );
}

export default App;
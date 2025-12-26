import React, { useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export const LayoutInputs: React.FC<Props> = ({ value, onChange }) => {
  // Parse initial value "2室1厅1卫"
  const [room, setRoom] = useState(() => value.match(/(\d+)室/)?.[1] || '');
  const [hall, setHall] = useState(() => value.match(/(\d+)厅/)?.[1] || '');
  const [toilet, setToilet] = useState(() => value.match(/(\d+)卫/)?.[1] || '');

  const handleChange = (type: 'room' | 'hall' | 'toilet', val: string) => {
    // Validate number
    const num = val.replace(/[^\d]/g, '');
    let newRoom = room;
    let newHall = hall;
    let newToilet = toilet;

    if (type === 'room') { setRoom(num); newRoom = num; }
    if (type === 'hall') { setHall(num); newHall = num; }
    if (type === 'toilet') { setToilet(num); newToilet = num; }

    if (newRoom) {
        let res = `${newRoom}室`;
        if (newHall) res += `${newHall}厅`;
        if (newToilet) res += `${newToilet}卫`;
        onChange(res);
    } else {
        onChange('');
    }
  };

  return (
    <div className="space-y-1.5">
       <label className="text-[10px] font-bold text-slate-500 ml-1">房源户型</label>
       <div className="flex items-center gap-2">
           <div className="relative flex-1">
             <input 
                inputMode="numeric"
                className="w-full h-11 px-3 border rounded-lg bg-background text-sm font-bold text-center outline-none focus:ring-2 focus:ring-primary/20"
                value={room}
                onChange={(e) => handleChange('room', e.target.value)}
                placeholder="2"
             />
             <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">室</span>
           </div>
           <div className="relative flex-1">
             <input 
                inputMode="numeric"
                className="w-full h-11 px-3 border rounded-lg bg-background text-sm font-bold text-center outline-none focus:ring-2 focus:ring-primary/20"
                value={hall}
                onChange={(e) => handleChange('hall', e.target.value)}
                placeholder="1"
             />
             <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">厅</span>
           </div>
           <div className="relative flex-1">
             <input 
                inputMode="numeric"
                className="w-full h-11 px-3 border rounded-lg bg-background text-sm font-bold text-center outline-none focus:ring-2 focus:ring-primary/20"
                value={toilet}
                onChange={(e) => handleChange('toilet', e.target.value)}
                placeholder="1"
             />
             <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">卫</span>
           </div>
       </div>
    </div>
  );
};

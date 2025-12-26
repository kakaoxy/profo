import React from 'react';
import NextImage from 'next/image';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Lead, LeadStatus } from '../types';
import { STATUS_CONFIG } from '../constants';

interface LeadsGridProps {
  leads: Lead[];
  onOpenDetail: (id: string) => void;
}

export const LeadsGrid: React.FC<LeadsGridProps> = ({ leads, onOpenDetail }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {leads.map(lead => (
        <Card key={lead.id} className="overflow-hidden border-none shadow-sm hover:shadow-md transition-all cursor-pointer group" onClick={() => onOpenDetail(lead.id)}>
          <div className="relative aspect-video flex items-center justify-center bg-slate-100 dark:bg-slate-800">
            {lead.images && lead.images.length > 0 ? (
                <NextImage src={lead.images[0]} className="object-cover transition-transform group-hover:scale-105" alt="lead" fill />
            ) : (
                <div className="flex flex-col items-center gap-2 text-slate-300">
                    <ImageOff className="h-8 w-8 text-slate-300" />
                </div>
            )}
            <div className="absolute top-3 left-3">
              <Badge 
                className={cn(
                  "font-bold border-none shadow-sm",
                  lead.status === LeadStatus.SIGNED && "bg-indigo-600 text-white"
                )} 
                variant={
                  lead.status === LeadStatus.SIGNED ? "secondary" :
                  lead.status === LeadStatus.VISITED ? "default" :
                  lead.status === LeadStatus.PENDING_ASSESSMENT ? "default" : "secondary"
                }
              >
                {STATUS_CONFIG[lead.status]?.label}
              </Badge>
            </div>
          </div>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base font-bold line-clamp-1">{lead.communityName}</CardTitle>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {lead.district} · {lead.businessArea}
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="flex justify-between items-end">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">ASKING PRICE</span>
                <span className="text-lg font-black text-primary">¥{lead.totalPrice}万</span>
              </div>
              <div className="text-right flex flex-col items-end">
                 <span className="text-xs font-bold">{lead.layout}</span>
                 <span className="text-[10px] text-muted-foreground">{lead.area}㎡ · {lead.floorInfo}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

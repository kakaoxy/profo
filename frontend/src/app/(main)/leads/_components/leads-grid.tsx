import React from 'react';
import Image from 'next/image';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, ImageOff, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Lead, LeadStatus } from '../types';
import { STATUS_CONFIG } from '../constants';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface LeadsGridProps {
  leads: Lead[];
  onOpenDetail: (id: string) => void;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
}

export const LeadsGrid: React.FC<LeadsGridProps> = ({ leads, onOpenDetail, onEdit, onDelete }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {leads.map(lead => (
        <Card key={lead.id} className="overflow-hidden border-none shadow-sm hover:shadow-md transition-all cursor-pointer group" onClick={() => onOpenDetail(lead.id)}>
          <div className="relative aspect-video flex items-center justify-center bg-slate-100 dark:bg-slate-800">
            {lead.images && lead.images.length > 0 ? (
                <Image 
                  src={lead.images[0]} 
                  alt="lead" 
                  fill
                  className="object-cover transition-transform group-hover:scale-105" 
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  unoptimized={lead.images[0]?.includes('127.0.0.1') || lead.images[0]?.includes('localhost')}
                />
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
            <div className="absolute top-3 right-3" onClick={(e) => e.stopPropagation()}>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 bg-white/50 backdrop-blur-md hover:bg-white/80 rounded-full shadow-sm text-slate-700">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(lead)}>
                      <Pencil className="mr-2 h-4 w-4" /> 编辑
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDelete(lead.id)} className="text-destructive focus:text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" /> 删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
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

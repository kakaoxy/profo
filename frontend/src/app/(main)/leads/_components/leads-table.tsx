import React from 'react';
// Note: Using native img instead of next/image to avoid private IP restriction in dev
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Lead, LeadStatus } from '../types';
import { STATUS_CONFIG } from '../constants';

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface LeadsTableProps {
  leads: Lead[];
  onOpenDetail: (id: string) => void;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
}

export const LeadsTable: React.FC<LeadsTableProps> = ({ leads, onOpenDetail, onEdit, onDelete }) => {
  return (
    <Card className="border-none shadow-sm overflow-hidden bg-white/80">
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50/50 border-b">
            <tr className="text-left text-[11px] font-black uppercase tracking-wider text-muted-foreground">
              <th className="p-4 pl-8">小区基本面</th>
              <th className="p-4">面积/户型</th>
              <th className="p-4">价格详情</th>
              <th className="p-4 text-center">状态</th>
              <th className="p-4">最后跟进</th>
              <th className="p-4 pr-8 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y text-sm">
            {leads.map(lead => (
              <tr 
                  key={lead.id} 
                  className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                  onClick={() => onOpenDetail(lead.id)}
              >
                <td className="p-4 pl-8">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-16 overflow-hidden rounded-md bg-slate-100 border relative flex items-center justify-center">
                      {lead.images && lead.images.length > 0 ? (
                         /* eslint-disable-next-line @next/next/no-img-element */
                         <img src={lead.images[0]} className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105" alt="prop" />
                      ) : (
                         <Home className="h-5 w-5 text-slate-300" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 group-hover:text-primary">{lead.communityName}</span>
                      <span className="text-xs text-muted-foreground">{lead.district} · {lead.businessArea}</span>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex flex-col">
                    <span className="font-medium">{lead.layout}</span>
                    <span className="text-xs text-muted-foreground">{lead.area}㎡ · {lead.floorInfo}</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-blue-600">¥{lead.totalPrice}万</span>
                    <span className="text-[10px] text-muted-foreground">{lead.unitPrice?.toFixed(2)}万/㎡</span>
                  </div>
                </td>
                <td className="p-4 text-center">
                  <Badge 
                    variant={
                      lead.status === LeadStatus.SIGNED ? "secondary" :
                      lead.status === LeadStatus.VISITED ? "default" : 
                      lead.status === LeadStatus.REJECTED ? "destructive" :
                      lead.status === LeadStatus.PENDING_VISIT ? "outline" : "default"
                    }
                    className={cn(
                      "font-bold",
                      lead.status === LeadStatus.SIGNED && "bg-indigo-100 text-indigo-700 border-indigo-200",
                      lead.status === LeadStatus.VISITED && "bg-emerald-100 text-emerald-700 border-emerald-200",
                      lead.status === LeadStatus.PENDING_VISIT && "bg-orange-100 text-orange-700 border-orange-200",
                      lead.status === LeadStatus.PENDING_ASSESSMENT && "bg-blue-100 text-blue-700 border-blue-200"
                    )}
                  >
                    {STATUS_CONFIG[lead.status]?.label}
                  </Badge>
                </td>
                <td className="p-4">
                  <div className="flex flex-col">
                    <span className="font-medium text-xs">{lead.creatorName}</span>
                    <span className="text-[10px] text-muted-foreground">{lead.lastFollowUpAt || lead.createdAt}</span>
                  </div>
                </td>
                <td className="p-4 pr-8 text-right">
                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

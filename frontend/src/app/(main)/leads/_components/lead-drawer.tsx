import React, { useState, useEffect } from 'react';
import { Lead, LeadStatus, FollowUpMethod, FollowUp } from '../types';
import { getLeadFollowUpsAction } from '../actions';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { DrawerHeader } from './drawer-parts/drawer-header';
import { LifecycleStepper } from './drawer-parts/lifecycle-stepper';
import { TabsNav, TabId } from './drawer-parts/tabs-nav';
import { InfoTab } from './drawer-parts/info-tab';
import { ImagesTab } from './drawer-parts/images-tab';
import { FollowUpTab } from './drawer-parts/follow-up-tab';

interface Props {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onAudit: (leadId: string, status: LeadStatus, evalPrice?: number, reason?: string) => void;
  onAddFollowUp: (leadId: string, method: FollowUpMethod, content: string) => void;
  onViewMonitor: (lead: Lead) => void;
  onImagesUpdate?: (leadId: string, images: string[]) => void;
}

export const LeadDrawer: React.FC<Props> = ({ lead, isOpen, onClose, onAudit, onAddFollowUp, onViewMonitor, onImagesUpdate }) => {
  const [activeTab, setActiveTab] = useState<TabId>('info');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  useEffect(() => {
    if (lead && isOpen) {
       getLeadFollowUpsAction(lead.id).then(setFollowUps);
    }
  }, [isOpen, lead]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setActiveTab('info');
      onClose();
    }
  };

  const handleImagesChange = (images: string[]) => {
    if (lead && onImagesUpdate) {
      onImagesUpdate(lead.id, images);
    }
  };

  if (!lead) return null;

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[550px] md:w-[650px] p-0 flex flex-col gap-0"
      >
        <SheetTitle className="sr-only">客户详情</SheetTitle>
        <DrawerHeader lead={lead} onViewMonitor={onViewMonitor} />

        <LifecycleStepper lead={lead} />

        <TabsNav activeTab={activeTab} onTabChange={setActiveTab} imagesCount={lead.images.length} />

        <div key={lead.id} className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar bg-muted/30">
          {activeTab === 'info' ? (
            <InfoTab lead={lead} onAudit={onAudit} onViewMonitor={onViewMonitor} />
          ) : activeTab === 'images' ? (
            <ImagesTab images={lead.images} onImagesChange={onImagesUpdate ? handleImagesChange : undefined} />
          ) : (
            <FollowUpTab
              lead={lead}
              followUps={followUps}
              onAddFollowUp={onAddFollowUp}
              onRefreshFollowUps={setFollowUps}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
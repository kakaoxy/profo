'use server'

import { fetchClient } from '@/lib/api-server';
import { Lead, FilterState, LeadStatus, FollowUpMethod } from './types';
import { revalidatePath } from 'next/cache';
import { components, operations } from '@/lib/api-types';

type BackendLead = components['schemas']['LeadResponse'];
type LeadsQuery = operations['get_leads_api_v1_leads__get']['parameters']['query'];



export async function createLeadAction(data: Omit<Lead, 'id' | 'createdAt'>) {
  const client = await fetchClient();
  
  const payload = {
    community_name: data.communityName,
    is_hot: 0,
    layout: data.layout,
    orientation: data.orientation,
    floor_info: data.floorInfo,
    area: data.area,
    total_price: data.totalPrice,
    unit_price: data.unitPrice,
    eval_price: data.evalPrice,
    district: data.district,
    business_area: data.businessArea,
    remarks: data.remarks,
    images: data.images || [],
    status: data.status, // Pass initial status if set
  };

  const { data: responseData, error } = await client.POST('/api/v1/leads/', {
    body: payload,
  });

  if (error || !responseData) {
    console.error("Create lead error:", error);
    const errorMessage = typeof error === 'object' ? JSON.stringify(error) : error || 'Failed to create lead';
    throw new Error(errorMessage);
  }

  revalidatePath('/leads');
  return mapBackendToFrontend(responseData);
}

export async function getLeadsAction(filters: FilterState) {
    const client = await fetchClient();
    // Construct query params
    const query: LeadsQuery = {
        page: 1,
        page_size: 100, 
    };
    if (filters.search) query.search = filters.search;

    if (filters.statuses && filters.statuses.length > 0) {
        query.statuses = filters.statuses as components["schemas"]["LeadStatus"][];
    }


    const { data, error } = await client.GET('/api/v1/leads/', {
        params: { query }
    });

    if (error || !data) {
        console.error("Get leads error:", error);
        return [];
    }
    
    return (data.items || []).map(mapBackendToFrontend);
}

export async function updateLeadAction(leadId: string, data: Partial<Lead>) {
    const client = await fetchClient();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
        community_name: data.communityName,
        layout: data.layout,
        orientation: data.orientation,
        floor_info: data.floorInfo,
        area: data.area,
        total_price: data.totalPrice,
        unit_price: data.unitPrice,
        eval_price: data.evalPrice,
        district: data.district,
        business_area: data.businessArea,
        remarks: data.remarks,
        images: data.images,
        status: data.status,
        audit_reason: data.auditReason,
    };
    
    // Clean up undefined values
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    const { data: responseData, error } = await client.PUT('/api/v1/leads/{lead_id}', {
        params: { path: { lead_id: leadId } },
        body: payload
    });

    if (error || !responseData) {
        console.error("Update lead error:", error);
         const errorMessage = typeof error === 'object' ? JSON.stringify(error) : error || 'Failed to update lead';
        throw new Error(errorMessage);
    }

    revalidatePath('/leads');
    revalidatePath('/leads');
    return mapBackendToFrontend(responseData);
}

export async function deleteLeadAction(leadId: string) {
    const client = await fetchClient();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await client.DELETE('/api/v1/leads/{lead_id}' as any, {
        params: { path: { lead_id: leadId } }
    });

    if (error) {
        console.error("Delete lead error:", error);
        const errorMessage = typeof error === 'object' ? JSON.stringify(error) : error || 'Failed to delete lead';
        throw new Error(errorMessage);
    }

    revalidatePath('/leads');
    return { success: true };
}

export async function addFollowUpAction(leadId: string, method: FollowUpMethod, content: string) {
    const client = await fetchClient();
    
    const payload = {
        method,
        content
    };

    const { error } = await client.POST('/api/v1/leads/{lead_id}/follow-ups', {
        params: { path: { lead_id: leadId } },
        body: payload
    });

    if (error) {
        console.error("Add follow-up error:", error);
        const errorMessage = typeof error === 'object' ? JSON.stringify(error) : error || 'Failed to add follow-up';
        throw new Error(errorMessage);
    }

    revalidatePath('/leads');
    return { success: true };
}

export async function getLeadFollowUpsAction(leadId: string): Promise<import('./types').FollowUp[]> {
    const client = await fetchClient();
    const { data, error } = await client.GET('/api/v1/leads/{lead_id}/follow-ups', {
        params: { path: { lead_id: leadId } }
    });
    
    if (error || !data) {
        console.error("Get follow-ups error:", error);
        return [];
    }

    return data.map(f => ({
        id: f.id,
        leadId: f.lead_id,
        method: f.method,
        content: f.content,
        followUpTime: new Date(f.followed_at).toLocaleString(),
        createdBy: f.created_by_name || 'Unknown' // Use name if available
    }));
}

export async function getLeadPriceHistoryAction(leadId: string): Promise<import('./types').PriceHistory[]> {
    const client = await fetchClient();
     const { data, error } = await client.GET('/api/v1/leads/{lead_id}/prices', {
        params: { path: { lead_id: leadId } }
    });

    if (error || !data) {
        console.error("Get price history error:", error);
        return [];
    }

    return data.map(p => ({
        id: p.id,
        leadId: p.lead_id,
        price: p.price,
        remark: p.remark ?? undefined,
        recordedAt: new Date(p.recorded_at).toLocaleString(),
        createdByName: p.created_by_name ?? undefined
    }));
}

export async function searchCommunitiesAction(query: string) {
    const client = await fetchClient();
    const { data, error } = await client.GET('/api/properties/communities/search', {
        params: { query: { q: query } }
    });
    
    if (error || !data) {
        console.error("Search communities error:", error);
        return [];
    }
    
    return data as { id: number; name: string; district: string; business_circle: string }[];
}

function mapBackendToFrontend(backendLead: BackendLead): Lead {
    return {
        id: backendLead.id,
        communityName: backendLead.community_name,
        layout: backendLead.layout ?? '',
        orientation: backendLead.orientation ?? '',
        floorInfo: backendLead.floor_info ?? '',
        area: backendLead.area ?? 0,
        totalPrice: backendLead.total_price ?? 0,
        unitPrice: backendLead.unit_price ?? 0,
        status: backendLead.status as LeadStatus,
        evalPrice: backendLead.eval_price ?? undefined,
        auditReason: backendLead.audit_reason ?? undefined,
        auditorId: backendLead.auditor_id?.toString() ?? undefined,
        auditTime: backendLead.audit_time ?? undefined,
        images: backendLead.images || [],
        district: backendLead.district ?? '',
        businessArea: backendLead.business_area ?? '',
        remarks: backendLead.remarks ?? '',
        creatorName: backendLead.creator_name ?? '未知',
        lastFollowUpAt: backendLead.last_follow_up_at ?? undefined,
        createdAt: new Date(backendLead.created_at).toLocaleString(),
    };
}

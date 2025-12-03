import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
    type Project,
    type CashFlowRecord,
    type ProjectFilters,
    RenovationStage,
} from './types';
import {
    fetchProjects,
    fetchProject as fetchProjectApi,
    createProject,
    updateProject as updateProjectApi,
    updateProjectStatus as updateProjectStatusApi,
    createCashFlowRecord,
    deleteCashFlowRecord,
    fetchProjectCashFlow,
    updateRenovationStage,
    uploadRenovationPhoto,
    uploadFile,
} from '../../api/projects.ts';

// Helper: safely extract array from API response
function extractArrayFromResponse(response: any, key: string): any[] {
    if (!response || typeof response !== 'object') return [];
    if (Array.isArray(response)) return response;
    if (Array.isArray(response[key])) return response[key];
    if (response.data && Array.isArray(response.data[key])) return response.data[key];
    console.warn(`[Store] Unexpected response structure for key "${key}":`, response);
    return [];
}

// Helper: map backend fields to frontend fields
function mapRecordToFrontend(record: any, projectId?: string): CashFlowRecord {
    return {
        ...record,
        projectId: record.projectId || record.project_id || projectId,
    };
}

export const useProjectManagementStore = defineStore('project-management', () => {
    // State
    const loading = ref(false);
    const error = ref<string | null>(null);

    // Mock Projects
    const projects = ref<Project[]>([
        {
            id: 'P001',
            name: '阳光花园 3-201',
            community_name: '阳光花园',
            status: 'renovating',
            manager: '张三',
            signing_price: 200,
            signing_date: '2023-10-01',
            signing_period: 180,
            planned_handover_date: '2024-04-01',
            currentRenovationStage: RenovationStage.WOOD,
            renovationStartDate: '2023-10-05',
        },
        {
            id: 'P002',
            name: '翠湖天地 5-1102',
            community_name: '翠湖天地',
            status: 'selling',
            manager: '李四',
            signing_price: 550,
            signing_date: '2023-09-15',
            signing_period: 120,
            planned_handover_date: '2024-01-15',
            renovationStartDate: '2023-09-20',
            renovationEndDate: '2023-11-20',
            sellingStartDate: '2023-11-21',
            channelManager: '王五',
        },
        {
            id: 'P003',
            name: '锦绣江南 8-606',
            community_name: '锦绣江南',
            status: 'signing',
            manager: '赵六',
            signing_price: 320,
            signing_date: '2023-11-01',
            signing_period: 90,
            planned_handover_date: '2024-02-01',
        },
        {
            id: 'P004',
            name: '东方曼哈顿 1-101',
            community_name: '东方曼哈顿',
            status: 'sold',
            manager: '钱七',
            signing_price: 800,
            signing_date: '2023-06-01',
            signing_period: 150,
            planned_handover_date: '2023-11-01',
            renovationStartDate: '2023-06-05',
            renovationEndDate: '2023-08-05',
            sellingStartDate: '2023-08-06',
            soldDate: '2023-09-10',
            soldPrice: 1050,
        },
    ]);

    // Mock Cash Flows
    const cashFlows = ref<CashFlowRecord[]>([
        {
            id: 'CF001',
            projectId: 'P001',
            date: '2023-10-02',
            type: 'expense',
            category: '履约保证金',
            description: '支付房东保证金',
            amount: 50000,
        },
        {
            id: 'CF002',
            projectId: 'P001',
            date: '2023-10-06',
            type: 'expense',
            category: '装修费',
            description: '水电阶段预付款',
            amount: 30000,
        },
        {
            id: 'CF003',
            projectId: 'P004',
            date: '2023-09-15',
            type: 'income',
            category: '售房款',
            description: '收到首付款',
            amount: 3000000,
        },
    ]);

    const filters = ref<ProjectFilters>({
        status: 'all',
        searchQuery: '',
    });

    // Getters
    const filteredProjects = computed(() => {
        return projects.value.filter((p) => {
            const matchStatus = filters.value.status === 'all' || p.status === filters.value.status;
            const matchSearch =
                !filters.value.searchQuery ||
                p.community_name?.includes(filters.value.searchQuery) ||
                p.name.includes(filters.value.searchQuery);
            return matchStatus && matchSearch;
        });
    });

    const getProjectCashFlow = (projectId: string) => {
        const flows = cashFlows.value.filter((cf) => cf.projectId === projectId);
        const income = flows.filter((cf) => cf.type === 'income').reduce((sum, cf) => sum + cf.amount, 0);
        const expense = flows.filter((cf) => cf.type === 'expense').reduce((sum, cf) => sum + cf.amount, 0);
        return { income, expense, net: income - expense };
    };

    // Actions
    const addProject = async (project: Project) => {
        try {
            const createdProject = await createProject(project);
            projects.value.push(createdProject);
            return createdProject;
        } catch (err) {
            console.error('[Store] Failed to create project:', err);
            throw err;
        }
    };

    const updateProject = async (id: string, updates: Partial<Project>) => {
        try {
            const updatedProject = await updateProjectApi(id, updates);
            const index = projects.value.findIndex((p) => p.id === id);
            if (index !== -1) {
                projects.value[index] = { ...projects.value[index], ...updatedProject };
            }
        } catch (err) {
            console.error('[Store] Failed to update project:', err);
            throw err;
        }
    };

    const updateProjectStatus = async (id: string, status: string) => {
        try {
            const updatedProject = await updateProjectStatusApi(id, status);
            const index = projects.value.findIndex((p) => p.id === id);
            if (index !== -1) {
                projects.value[index] = { ...projects.value[index], ...updatedProject };
            }
            return updatedProject;
        } catch (err) {
            console.error('[Store] Failed to update project status:', err);
            throw err;
        }
    };

    const updateProjectRenovationStage = async (id: string, stage: string, completedAt?: string) => {
        try {
            await updateRenovationStage(id, { renovation_stage: stage, stage_completed_at: completedAt });
            const project = projects.value.find((p) => p.id === id);
            if (project) {
                project.currentRenovationStage = stage as RenovationStage;
            }
        } catch (err) {
            console.error('Failed to update renovation stage:', err);
            throw err;
        }
    };

    const uploadProjectRenovationPhoto = async (id: string, stage: string, file: File) => {
        try {
            const { url, filename } = await uploadFile(file);
            const photoRecord = await uploadRenovationPhoto(id, stage, url, filename);
            return photoRecord;
        } catch (err) {
            console.error('Failed to upload renovation photo:', err);
            throw err;
        }
    };

    const addCashFlow = async (record: CashFlowRecord) => {
        if (!record.projectId) return;

        try {
            const response = await createCashFlowRecord(record.projectId, {
                type: record.type,
                category: record.category,
                amount: record.amount,
                date: record.date,
                description: record.description,
            });

            let createdRecord: CashFlowRecord | null = null;
            if (response && typeof response === 'object') {
                createdRecord = 'data' in response ? (response.data as CashFlowRecord) : (response as CashFlowRecord);
            }

            if (createdRecord) {
                const mappedRecord = mapRecordToFrontend(createdRecord, record.projectId);
                cashFlows.value.push(mappedRecord);
            } else {
                console.warn('[Store] Failed to extract created record from response:', response);
            }
        } catch (err) {
            console.error('Failed to create cash flow record:', err);
            throw err;
        }
    };

    const deleteCashFlow = async (id: string) => {
        const record = cashFlows.value.find((cf) => cf.id === id);
        if (!record || !record.projectId) {
            console.error(`[Store] Cannot delete: record not found or missing projectId`, { id, record });
            throw new Error('记录不存在或缺少项目ID');
        }

        try {
            await deleteCashFlowRecord(id, record.projectId);
            const index = cashFlows.value.findIndex((cf) => cf.id === id);
            if (index !== -1) {
                cashFlows.value.splice(index, 1);
            }
        } catch (err) {
            console.error('Failed to delete cash flow record:', err);
            throw err;
        }
    };

    const setFilters = (newFilters: Partial<ProjectFilters>) => {
        filters.value = { ...filters.value, ...newFilters };
    };

    const loadProjects = async () => {
        loading.value = true;
        error.value = null;
        try {
            const response = await fetchProjects();
            projects.value = extractArrayFromResponse(response, 'items');
        } catch (err) {
            console.error('Failed to load projects:', err);
            error.value = '加载项目列表失败';
            projects.value = [];
            throw err;
        } finally {
            loading.value = false;
        }
    };

    const fetchProject = async (id: string) => {
        try {
            const project = await fetchProjectApi(id);
            const index = projects.value.findIndex((p) => p.id === id);
            if (index !== -1) {
                projects.value[index] = project;
            } else {
                projects.value.push(project);
            }
            return project;
        } catch (err) {
            console.error(`Failed to fetch project ${id}:`, err);
            throw err;
        }
    };

    const loadCashFlows = async (projectId: string) => {
        try {
            const response = await fetchProjectCashFlow(projectId);

            // Remove existing records for this project
            const indicesToRemove = cashFlows.value
                .map((cf, i) => (cf.projectId === projectId ? i : -1))
                .filter((i) => i !== -1)
                .sort((a, b) => b - a); // descending order for safe splice

            for (const i of indicesToRemove) {
                cashFlows.value.splice(i, 1);
            }

            const rawRecords = extractArrayFromResponse(response, 'records');
            const mappedRecords = rawRecords.map((r) => mapRecordToFrontend(r, projectId));
            cashFlows.value.push(...mappedRecords);
        } catch (err) {
            console.error(`[Store] Failed to load cash flows for project ${projectId}:`, err);
            throw err;
        }
    };

    return {
        projects,
        cashFlows,
        filters,
        loading,
        error,
        filteredProjects,
        getProjectCashFlow,
        addProject,
        updateProject,
        updateProjectStatus,
        updateProjectRenovationStage,
        uploadProjectRenovationPhoto,
        addCashFlow,
        deleteCashFlow,
        setFilters,
        loadProjects,
        fetchProject,
        loadCashFlows,
    };
});
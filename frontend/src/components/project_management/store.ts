import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { type Project, type CashFlowRecord, type ProjectFilters, RenovationStage } from './types';
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
    uploadFile
} from '../../api/projects.ts';

export const useProjectManagementStore = defineStore('project-management', () => {
    // State management
    const loading = ref(false);
    const error = ref<string | null>(null);

    // Mock Data
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

    // 初始化cashFlows为数组，确保始终是数组类型
    const cashFlows = ref<CashFlowRecord[]>([]);

    // 添加初始mock数据
    cashFlows.value = [
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
    ];

    const filters = ref<ProjectFilters>({
        status: 'all',
        searchQuery: '',
    });

    // Getters
    const filteredProjects = computed(() => {
        return projects.value.filter(p => {
            const matchStatus = filters.value.status === 'all' || p.status === filters.value.status;
            const matchSearch = !filters.value.searchQuery ||
                p.community_name?.includes(filters.value.searchQuery) ||
                p.name.includes(filters.value.searchQuery);
            return matchStatus && matchSearch;
        });
    });

    const getProjectCashFlow = (projectId: string) => {
        // 确保cashFlows.value是数组
        const cashFlowsArray = Array.isArray(cashFlows.value) ? cashFlows.value : [];
        const projectFlows = cashFlowsArray.filter(cf => cf.projectId === projectId);
        const income = projectFlows.filter(cf => cf.type === 'income').reduce((sum, cf) => sum + cf.amount, 0);
        const expense = projectFlows.filter(cf => cf.type === 'expense').reduce((sum, cf) => sum + cf.amount, 0);
        return {
            income,
            expense,
            net: income - expense
        };
    };

    // Actions
    const addProject = async (project: Project) => {
        try {
            // console.log('[Store] Creating project:', project);
            const createdProject = await createProject(project);
            // console.log('[Store] Created project:', createdProject);

            projects.value.push(createdProject);
            // console.log('[Store] Project added to store, total projects:', projects.value.length);
            return createdProject;
        } catch (error) {
            console.error('[Store] Failed to create project:', error);
            throw error;
        }
    };

    const updateProject = async (id: string, updates: Partial<Project>) => {
        try {
            // console.log('[Store] Updating project:', id, updates);
            const updatedProject = await updateProjectApi(id, updates);
            // console.log('[Store] Updated project:', updatedProject);

            const index = projects.value.findIndex(p => p.id === id);
            if (index !== -1) {
                projects.value[index] = { ...projects.value[index], ...updatedProject };
                console.log('[Store] Project updated in store:', projects.value[index]);
            } else {
                console.warn('[Store] Project not found in store:', id);
            }
        } catch (error) {
            console.error('[Store] Failed to update project:', error);
            throw error;
        }
    };

    const updateProjectStatus = async (id: string, status: string) => {
        try {
            // console.log('[Store] Updating project status:', id, status);
            const updatedProject = await updateProjectStatusApi(id, status);

            const index = projects.value.findIndex(p => p.id === id);
            if (index !== -1) {
                projects.value[index] = { ...projects.value[index], ...updatedProject };
            }
            return updatedProject;
        } catch (error) {
            console.error('[Store] Failed to update project status:', error);
            throw error;
        }
    };

    const updateProjectRenovationStage = async (id: string, stage: string, completedAt?: string) => {
        try {
            await updateRenovationStage(id, { renovation_stage: stage, stage_completed_at: completedAt });
            // Update local state
            const project = projects.value.find(p => p.id === id);
            if (project) {
                project.currentRenovationStage = stage as RenovationStage;
            }
        } catch (error) {
            console.error('Failed to update renovation stage:', error);
            throw error;
        }
    };

    const uploadProjectRenovationPhoto = async (id: string, stage: string, file: File) => {
        try {
            // 1. Upload file
            const { url, filename } = await uploadFile(file);
            // 2. Link to project
            const photoRecord = await uploadRenovationPhoto(id, stage, url, filename);
            return photoRecord;
        } catch (error) {
            console.error('Failed to upload renovation photo:', error);
            throw error;
        }
    };

    const addCashFlow = async (record: CashFlowRecord) => {
        try {
            if (!record.projectId) return;
            // 直接使用record.amount，因为在组件中已经转换为实际金额（元）
            const response = await createCashFlowRecord(record.projectId, {
                type: record.type as 'income' | 'expense',
                category: record.category,
                amount: record.amount,
                date: record.date,
                description: record.description
            });

            // console.log('[Store] Create cash flow response:', response);

            // Handle wrapped response
            let createdRecord: CashFlowRecord | null = null;

            // Case 1: Response wrapped in {code, msg, data: CashFlowRecord}
            if (response && typeof response === 'object' && 'data' in response && response.data) {
                createdRecord = response.data as CashFlowRecord;
                // console.log('[Store] Created record from response.data');
            }
            // Case 2: Direct CashFlowRecord
            else if (response && typeof response === 'object') {
                createdRecord = response as CashFlowRecord;
                // console.log('[Store] Created record from direct response');
            }

            // Add the created record to store with field mapping
            if (createdRecord) {
                // Map backend field names to frontend field names
                const mappedRecord = {
                    ...createdRecord,
                    // Ensure projectId is set (backend uses project_id)
                    projectId: createdRecord.projectId || (createdRecord as any).project_id || record.projectId,
                };

                // 使用后端返回的记录更新本地状态，确保数据一致性
                // 确保cashFlows.value是数组
                if (!Array.isArray(cashFlows.value)) {
                    cashFlows.value = [];
                }
                cashFlows.value.push(mappedRecord);
                // console.log(`[Store] Added cash flow record with ID: ${mappedRecord.id}, projectId: ${mappedRecord.projectId}`);
                // console.log(`[Store] Total in store: ${cashFlows.value.length}`);
            } else {
                console.warn('[Store] Failed to extract created record from response:', response);
            }
        } catch (error) {
            console.error('Failed to create cash flow record:', error);
            throw error;
        }
    };

    const deleteCashFlow = async (id: string) => {
        try {
            // 确保cashFlows.value是数组
            if (!Array.isArray(cashFlows.value)) {
                cashFlows.value = [];
                return;
            }
            const record = cashFlows.value.find(cf => cf.id === id);
            if (!record || !record.projectId) {
                console.error(`[Store] Cannot delete: record not found or missing projectId`, { id, record });
                throw new Error('记录不存在或缺少项目ID');
            }

            // console.log(`[Store] Deleting cash flow record:`, {
            //     id: record.id,
            //     projectId: record.projectId,
            //     category: record.category,
            //     amount: record.amount
            // });

            await deleteCashFlowRecord(id, record.projectId);

            const index = cashFlows.value.findIndex(cf => cf.id === id);
            if (index !== -1) {
                cashFlows.value.splice(index, 1);
                // console.log(`[Store] Record deleted successfully from store`);
            }
        } catch (error) {
            console.error('Failed to delete cash flow record:', error);
            throw error;
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
            // console.log('[Store] Raw fetchProjects response:', response);
            // console.log('[Store] Response type:', typeof response);
            // console.log('[Store] Response keys:', response ? Object.keys(response) : 'null');

            // Handle different response structures
            // Case 1: Direct pagination response { items: [], total, page, page_size }
            if (response && typeof response === 'object' && 'items' in response && Array.isArray(response.items)) {
                projects.value = response.items;
                // console.log('[Store] Projects loaded from response.items, count:', projects.value.length);
            }
            // Case 2: Data wrapped in 'data' field { data: { items: [], total, page, page_size } }
            else if (response && typeof response === 'object' && 'data' in response && response.data && typeof response.data === 'object' && 'items' in response.data) {
                projects.value = Array.isArray(response.data.items) ? response.data.items : [];
                // console.log('[Store] Projects loaded from response.data.items, count:', projects.value.length);
            }
            // Case 3: Direct array response
            else if (Array.isArray(response)) {
                projects.value = response;
                // console.log('[Store] Projects loaded from direct array, count:', projects.value.length);
            }
            // Fallback: ensure projects is an empty array
            else {
                console.warn('[Store] Unexpected response structure:', response);
                projects.value = [];
            }
        } catch (err) {
            console.error('Failed to load projects:', err);
            error.value = '加载项目列表失败';
            // Ensure projects remains an array even on error
            if (!Array.isArray(projects.value)) {
                projects.value = [];
            }
            throw err;
        } finally {
            loading.value = false;
        }
    };

    const fetchProject = async (id: string) => {
        try {
            const project = await fetchProjectApi(id);
            const index = projects.value.findIndex(p => p.id === id);
            if (index !== -1) {
                projects.value[index] = project;
            } else {
                projects.value.push(project);
            }
            return project;
        } catch (error) {
            console.error(`Failed to fetch project ${id}:`, error);
            throw error;
        }
    };

    const loadCashFlows = async (projectId: string) => {
        try {
            // console.log(`[Store] Loading cash flows for project: ${projectId}`);
            const response = await fetchProjectCashFlow(projectId);
            // console.log(`[Store] Raw fetchProjectCashFlow response:`, response);
            // console.log(`[Store] Response type:`, typeof response);
            // console.log(`[Store] Response keys:`, response ? Object.keys(response) : 'null');

            // Clear existing records for this project
            const existingIndices = cashFlows.value.map((cf, index) =>
                cf.projectId === projectId ? index : -1
            ).filter(index => index !== -1);

            // Remove existing records in reverse order to avoid index issues
            for (const index of existingIndices.sort((a, b) => b - a)) {
                cashFlows.value.splice(index, 1);
            }

            // Handle wrapped response from API
            let records: any[] = [];

            // Case 1: Response wrapped in {code, msg, data: {records, summary}}
            if (response && typeof response === 'object' && 'data' in response && response.data && typeof response.data === 'object') {
                if ('records' in response.data && Array.isArray(response.data.records)) {
                    records = response.data.records;
                    // console.log(`[Store] Loaded ${records.length} cash flow records from response.data.records for project ${projectId}`);
                    // Log first record to see structure
                    if (records.length > 0) {
                        // console.log(`[Store] Sample record structure:`, records[0]);
                        // console.log(`[Store] Sample record keys:`, Object.keys(records[0]));
                    }
                } else {
                    console.warn(`[Store] response.data exists but no records array found:`, response.data);
                }
            }
            // Case 2: Direct response {records, summary}
            else if (response && typeof response === 'object' && 'records' in response && Array.isArray(response.records)) {
                records = response.records;
                // console.log(`[Store] Loaded ${records.length} cash flow records from response.records for project ${projectId}`);
            }
            // Case 3: Direct array
            else if (Array.isArray(response)) {
                records = response;
                // console.log(`[Store] Loaded ${records.length} cash flow records from direct array for project ${projectId}`);
            }
            else {
                console.warn(`[Store] No valid records found in response for project ${projectId}:`, response);
            }

            // Add records to store with field mapping
            if (records.length > 0) {
                // Map backend field names (snake_case) to frontend field names (camelCase)
                const mappedRecords = records.map(record => ({
                    ...record,
                    // Ensure projectId is set (backend uses project_id)
                    projectId: record.projectId || record.project_id || projectId,
                }));

                cashFlows.value.push(...mappedRecords);
                // console.log(`[Store] Total cash flows in store after loading: ${cashFlows.value.length}`);

                // Verify the mapping worked
                const projectRecords = cashFlows.value.filter(cf => cf.projectId === projectId);
                // console.log(`[Store] Cash flows for project ${projectId}: ${projectRecords.length}`);

                if (projectRecords.length === 0 && records.length > 0) {
                    console.error(`[Store] ERROR: Loaded ${records.length} records but projectId filter returns 0!`);
                    console.error(`[Store] Expected projectId: "${projectId}"`);
                    console.error(`[Store] Sample mapped record:`, mappedRecords[0]);
                }
            }

            // Ensure cashFlows.value is always an array
            if (!Array.isArray(cashFlows.value)) {
                cashFlows.value = [];
            }
        } catch (err) {
            console.error(`[Store] Failed to load cash flows for project ${projectId}:`, err);
            // Ensure cashFlows.value is always an array even when error occurs
            if (!Array.isArray(cashFlows.value)) {
                cashFlows.value = [];
            }
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

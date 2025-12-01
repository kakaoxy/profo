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
    updateRenovationStage,
    uploadRenovationPhoto,
    uploadFile
} from '../../api/projects.ts';

export const useProjectManagementStore = defineStore('project-management', () => {
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
        return projects.value.filter(p => {
            const matchStatus = filters.value.status === 'all' || p.status === filters.value.status;
            const matchSearch = !filters.value.searchQuery ||
                p.community_name?.includes(filters.value.searchQuery) ||
                p.name.includes(filters.value.searchQuery);
            return matchStatus && matchSearch;
        });
    });

    const getProjectCashFlow = (projectId: string) => {
        const projectFlows = cashFlows.value.filter(cf => cf.projectId === projectId);
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
            console.log('[Store] Creating project:', project);
            const createdProject = await createProject(project);
            console.log('[Store] Created project:', createdProject);

            projects.value.push(createdProject);
            console.log('[Store] Project added to store, total projects:', projects.value.length);
        } catch (error) {
            console.error('[Store] Failed to create project:', error);
            throw error;
        }
    };

    const updateProject = async (id: string, updates: Partial<Project>) => {
        try {
            console.log('[Store] Updating project:', id, updates);
            const updatedProject = await updateProjectApi(id, updates);
            console.log('[Store] Updated project:', updatedProject);

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
            console.log('[Store] Updating project status:', id, status);
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
            await createCashFlowRecord(record.projectId, {
                type: record.type as 'income' | 'expense',
                category: record.category,
                amount: record.amount,
                date: record.date,
                description: record.description
            });
            cashFlows.value.push(record);
        } catch (error) {
            console.error('Failed to create cash flow record:', error);
            throw error;
        }
    };

    const deleteCashFlow = async (id: string) => {
        try {
            const record = cashFlows.value.find(cf => cf.id === id);
            if (!record || !record.projectId) return;

            await deleteCashFlowRecord(id, record.projectId);
            const index = cashFlows.value.findIndex(cf => cf.id === id);
            if (index !== -1) {
                cashFlows.value.splice(index, 1);
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
        try {
            const response = await fetchProjects();
            projects.value = response.items;
        } catch (error) {
            console.error('Failed to load projects:', error);
            throw error;
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

    return {
        projects,
        cashFlows,
        filters,
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
    };
});

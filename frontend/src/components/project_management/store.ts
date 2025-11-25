import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { type Project, type CashFlowRecord, type ProjectFilters, RenovationStage } from './types';

export const useProjectManagementStore = defineStore('project-management', () => {
    // Mock Data
    const projects = ref<Project[]>([
        {
            id: 'P001',
            name: '阳光花园 3-201',
            community: '阳光花园',
            status: 'renovating',
            manager: '张三',
            signingPrice: 200,
            signingDate: '2023-10-01',
            signingPeriod: 180,
            plannedHandoverDate: '2024-04-01',
            currentRenovationStage: RenovationStage.WOOD,
            renovationStartDate: '2023-10-05',
        },
        {
            id: 'P002',
            name: '翠湖天地 5-1102',
            community: '翠湖天地',
            status: 'selling',
            manager: '李四',
            signingPrice: 550,
            signingDate: '2023-09-15',
            signingPeriod: 120,
            plannedHandoverDate: '2024-01-15',
            renovationStartDate: '2023-09-20',
            renovationEndDate: '2023-11-20',
            sellingStartDate: '2023-11-21',
            channelManager: '王五',
        },
        {
            id: 'P003',
            name: '锦绣江南 8-606',
            community: '锦绣江南',
            status: 'signing',
            manager: '赵六',
            signingPrice: 320,
            signingDate: '2023-11-01',
            signingPeriod: 90,
            plannedHandoverDate: '2024-02-01',
        },
        {
            id: 'P004',
            name: '东方曼哈顿 1-101',
            community: '东方曼哈顿',
            status: 'sold',
            manager: '钱七',
            signingPrice: 800,
            signingDate: '2023-06-01',
            signingPeriod: 150,
            plannedHandoverDate: '2023-11-01',
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
                p.community.includes(filters.value.searchQuery) ||
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
    const addProject = (project: Project) => {
        projects.value.push(project);
    };

    const updateProject = (id: string, updates: Partial<Project>) => {
        const index = projects.value.findIndex(p => p.id === id);
        if (index !== -1) {
            projects.value[index] = { ...projects.value[index], ...updates };
        }
    };

    const addCashFlow = (record: CashFlowRecord) => {
        cashFlows.value.push(record);
    };

    const deleteCashFlow = (id: string) => {
        const index = cashFlows.value.findIndex(cf => cf.id === id);
        if (index !== -1) {
            cashFlows.value.splice(index, 1);
        }
    };

    const setFilters = (newFilters: Partial<ProjectFilters>) => {
        filters.value = { ...filters.value, ...newFilters };
    };

    return {
        projects,
        cashFlows,
        filters,
        filteredProjects,
        getProjectCashFlow,
        addProject,
        updateProject,
        addCashFlow,
        deleteCashFlow,
        setFilters,
    };
});

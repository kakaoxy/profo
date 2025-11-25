export type ProjectStatus = 'signing' | 'renovating' | 'selling' | 'sold';

export enum CashFlowType {
    INCOME = 'income',
    EXPENSE = 'expense'
}

export enum RenovationStage {
    DEMOLITION = '拆除',
    DESIGN = '设计',
    HYDRO = '水电',
    WOOD = '木瓦',
    PAINT = '油漆',
    INSTALL = '安装',
    DELIVER = '交付'
}

export enum CashFlowCategory {
    // Expense
    PERFORMANCE_BOND = '履约保证金',
    COMMISSION = '中介佣金',
    RENOVATION_COST = '装修费',
    MARKETING_COST = '营销费',
    OTHER_COST = '其他支出',
    TAXES = '税费',
    OPERATION_COST = '运营杂费',

    // Income
    PERFORMANCE_BOND_RETURN = '回收保证金',
    PREMIUM_INCOME = '溢价款',
    SERVICE_FEE_INCOME = '服务费',
    OTHER_INCOME = '其他收入',
    SELLING_INCOME = '售房款'
}

export interface PhotoRecord {
    id: string;
    url: string;
    category: string;
    timestamp: number;
}

export interface ViewingRecord {
    id: string;
    time: string;
    person: string;
}

export interface OfferRecord {
    id: string;
    time: string;
    client: string;
    price: number;
}

export interface NegotiationRecord {
    id: string;
    time: string;
    person: string;
}

export interface Project {
    id: string;
    name: string;
    community: string;
    status: ProjectStatus;
    manager: string;

    // Signing Phase
    signingPrice: number;
    signingDate: string;
    signingPeriod: number; // days
    plannedHandoverDate: string;

    // Property Info (Optional)
    address?: string;
    area?: number;
    ownerName?: string;
    ownerPhone?: string;
    ownerIdCard?: string;
    extensionPeriod?: number;
    extensionRent?: number;
    costAssumption?: string;
    otherAgreements?: string;
    remarks?: string;

    // Photos
    contractPhotos?: PhotoRecord[];
    propertyDeedPhotos?: PhotoRecord[];
    propertySurveyPhotos?: PhotoRecord[];
    idCardPhotos?: PhotoRecord[];
    bankCardPhotos?: PhotoRecord[];
    decorationContractPhotos?: PhotoRecord[];
    houseHandoverPhotos?: PhotoRecord[];
    receiptPhotos?: PhotoRecord[];
    cooperationConfirmationPhotos?: PhotoRecord[];
    storeInvestmentAgreementPhotos?: PhotoRecord[];
    valueAddedServiceConfirmationPhotos?: PhotoRecord[];
    otherPhotos?: PhotoRecord[];

    // Renovating Phase
    renovationStartDate?: string;
    renovationEndDate?: string;
    currentRenovationStage?: RenovationStage;
    renovationPhotos?: Record<RenovationStage, PhotoRecord[]>;
    renovationStageDates?: Record<string, string>;

    // Selling Phase
    sellingStartDate?: string;
    channelManager?: string;
    presenter?: string; // 讲房师
    negotiator?: string; // 谈判人
    viewingRecords?: ViewingRecord[];
    offerRecords?: OfferRecord[];
    negotiationRecords?: NegotiationRecord[];

    // Sold Phase
    soldDate?: string;
    soldPrice?: number;
}

export interface CashFlowRecord {
    id: string;
    projectId?: string; // Optional linkage to a project
    date: string;
    type: 'income' | 'expense';
    category: string;
    description: string;
    amount: number;
}

export interface ProjectFilters {
    status?: ProjectStatus | 'all';
    searchQuery?: string;
}

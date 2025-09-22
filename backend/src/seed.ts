import { PrismaClient } from '@prisma/client';
import { PortfolioSnapshot, DashboardVM } from './domain/types.js';
import { Transformer } from './services/transformer.js';
import { VersioningService } from './services/versioning.js';

const prisma = new PrismaClient();
const transformer = new Transformer();
const versioning = new VersioningService(prisma);

// Initial seed data matching the HTML content
const initialData: PortfolioSnapshot = {
  headers: {
    portfolio: 'Enterprise Projects',
    currentPeriodStart: 'Sept 11',
    currentPeriodEnd: 'Sept 17, 2025',
    comparisonPeriodStart: 'Sept 3',
    comparisonPeriodEnd: 'Sept 10, 2025',
    reportDate: 'September 17, 2025',
    sectionTitles: {
      portfolioStatus: 'Portfolio Projects Status',
      highlightsLowlights: 'Consolidated Highlights & Lowlights (All Projects)',
      keyMilestones: 'Key Milestones by Project',
    },
    tableHeaders: {
      project: 'Project',
      status: 'Status',
      projectManager: 'Project Manager',
      nextMilestone: 'Next Milestone',
      milestone: 'Milestone',
      owner: 'Owner',
      dueDate: 'Due Date',
      statusBadge: 'Status',
      workstreamUpdate: 'Workstream Update',
    },
  },
  status: [
    {
      project: 'FarEye B2B Transportation',
      statusColor: 'amber',
      trend: 'down',
      manager: 'Syed Zeeshan Mustafa',
      nextMilestone: 'UAT Completion (Sept 30)',
      order: 1,
    },
    {
      project: 'Warehouse Automation Ph2',
      statusColor: 'green',
      trend: 'up',
      manager: 'Ahmed Al-Rahman',
      nextMilestone: 'Integration Testing (Sept 25)',
      order: 2,
    },
    {
      project: 'Digital Transformation',
      statusColor: 'red',
      trend: 'down',
      manager: 'Sarah Mitchell',
      nextMilestone: 'Platform Selection (Delayed)',
      order: 3,
    },
    {
      project: 'Customer Portal Upgrade',
      statusColor: 'amber',
      trend: 'flat',
      manager: 'John Davies',
      nextMilestone: 'Beta Release (Oct 5)',
      order: 4,
    },
    {
      project: 'Supply Chain Optimization',
      statusColor: 'green',
      trend: 'flat',
      manager: 'Maria Rodriguez',
      nextMilestone: 'Pilot Launch (Oct 1)',
      order: 5,
    },
  ],
  highlights: [
    {
      kind: 'highlight',
      project: 'FarEye',
      description: 'Sprint 1 demo completed successfully with core B2B functionalities',
      order: 1,
    },
    {
      kind: 'highlight',
      project: 'Warehouse',
      description: 'Ahead of schedule by 5% with 8% cost savings achieved',
      order: 2,
    },
    {
      kind: 'highlight',
      project: 'Supply Chain',
      description: 'Risk mitigation completed, all high risks retired',
      order: 3,
    },
    {
      kind: 'highlight',
      project: 'Digital',
      description: 'Vendor contract renegotiated saving 12% on licensing',
      order: 4,
    },
    {
      kind: 'highlight',
      project: 'Portal',
      description: 'User acceptance testing achieved 85% positive feedback',
      order: 5,
    },
  ],
  lowlights: [
    {
      kind: 'lowlight',
      project: 'FarEye',
      description: '30+ UAT issues pending classification, impacting timeline',
      order: 1,
    },
    {
      kind: 'lowlight',
      project: 'Digital',
      description: 'Critical path slipped 15%, escalation required',
      order: 2,
    },
    {
      kind: 'lowlight',
      project: 'Digital',
      description: '3 key positions unfilled, creating resource gap',
      order: 3,
    },
    {
      kind: 'lowlight',
      project: 'Portal',
      description: 'Security vulnerability identified, patch required',
      order: 4,
    },
    {
      kind: 'lowlight',
      project: 'FarEye',
      description: 'API bulk processing limitation impacting integration',
      order: 5,
    },
  ],
  milestones: [
    // FarEye B2B Milestones
    {
      project: 'FarEye B2B',
      milestone: 'Sprint 1 Demo',
      owner: 'Nischal/Ismail',
      dueDate: '02-Sep',
      statusBadge: 'Completed',
      workstreamUpdate: 'Successfully demonstrated core B2B functionalities with order management',
      order: 1,
    },
    {
      project: 'FarEye B2B',
      milestone: 'UAT Testing',
      owner: 'Ismail Farhan',
      dueDate: '30-Sep',
      statusBadge: 'In Progress',
      workstreamUpdate: '30+ issues identified requiring immediate classification and ETA',
      order: 2,
    },
    {
      project: 'FarEye B2B',
      milestone: 'API Integration',
      owner: 'Nischal/Haitham',
      dueDate: '25-Sep',
      statusBadge: 'At Risk',
      workstreamUpdate: 'API limited to single order only. Technical call scheduled Sept 20',
      order: 3,
    },
    {
      project: 'FarEye B2B',
      milestone: 'Master Data',
      owner: 'Mohammed Tatar',
      dueDate: '30-Sep',
      statusBadge: '75%',
      workstreamUpdate: '981 customers loaded. Location coordinates collection ongoing',
      order: 4,
    },
    // Warehouse Automation Milestones
    {
      project: 'Warehouse Auto',
      milestone: 'System Design',
      owner: 'Tech Team',
      dueDate: '01-Sep',
      statusBadge: 'Completed',
      workstreamUpdate: 'Architecture finalized with all stakeholder approval received',
      order: 5,
    },
    {
      project: 'Warehouse Auto',
      milestone: 'Hardware Install',
      owner: 'Operations',
      dueDate: '15-Sep',
      statusBadge: 'Completed',
      workstreamUpdate: 'All automation equipment installed and operational',
      order: 6,
    },
    {
      project: 'Warehouse Auto',
      milestone: 'Integration Testing',
      owner: 'QA Team',
      dueDate: '25-Sep',
      statusBadge: '60%',
      workstreamUpdate: 'Testing proceeding on schedule with minor issues identified',
      order: 7,
    },
    {
      project: 'Warehouse Auto',
      milestone: 'Go-Live',
      owner: 'All Teams',
      dueDate: '01-Oct',
      statusBadge: 'Pending',
      workstreamUpdate: 'Pre-production preparations underway, training scheduled',
      order: 8,
    },
    // Digital Transformation Milestones
    {
      project: 'Digital Trans',
      milestone: 'Requirements',
      owner: 'Business Team',
      dueDate: '15-Aug',
      statusBadge: 'Completed',
      workstreamUpdate: 'All business requirements documented and signed off',
      order: 9,
    },
    {
      project: 'Digital Trans',
      milestone: 'Platform Selection',
      owner: 'Architecture',
      dueDate: '01-Sep',
      statusBadge: 'At Risk',
      workstreamUpdate: 'Vendor delivery issues. Executive escalation required',
      order: 10,
    },
    {
      project: 'Digital Trans',
      milestone: 'Pilot Implementation',
      owner: 'Tech Team',
      dueDate: '20-Sep',
      statusBadge: 'At Risk',
      workstreamUpdate: 'Blocked by platform selection. Recovery plan being developed',
      order: 11,
    },
    {
      project: 'Digital Trans',
      milestone: 'User Training',
      owner: 'HR Team',
      dueDate: '15-Oct',
      statusBadge: 'Pending',
      workstreamUpdate: 'Training materials in preparation, schedule being finalized',
      order: 12,
    },
    // Customer Portal Milestones
    {
      project: 'Portal Upgrade',
      milestone: 'UI/UX Design',
      owner: 'Design Team',
      dueDate: '10-Sep',
      statusBadge: 'Completed',
      workstreamUpdate: 'Design approved by all stakeholders with positive feedback',
      order: 13,
    },
    {
      project: 'Portal Upgrade',
      milestone: 'Backend Development',
      owner: 'Dev Team',
      dueDate: '20-Sep',
      statusBadge: '80%',
      workstreamUpdate: 'Core APIs complete, integration endpoints in progress',
      order: 14,
    },
    {
      project: 'Portal Upgrade',
      milestone: 'Security Testing',
      owner: 'Security Team',
      dueDate: '25-Sep',
      statusBadge: 'In Progress',
      workstreamUpdate: 'Vulnerability identified in auth module, patch in development',
      order: 15,
    },
    {
      project: 'Portal Upgrade',
      milestone: 'Beta Release',
      owner: 'Product Team',
      dueDate: '05-Oct',
      statusBadge: 'Pending',
      workstreamUpdate: 'Beta user group identified, release preparations on track',
      order: 16,
    },
  ],
  metrics: [
    {
      project: 'FarEye B2B Transportation',
      spi: 0.95,
      cpi: 0.98,
      sev1Defects: 0,
      sev2Defects: 3,
      issues: 30,
      riskScore: 0.6,
      milestoneCompletion: 0.4,
    },
    {
      project: 'Warehouse Automation Ph2',
      spi: 1.05,
      cpi: 1.08,
      sev1Defects: 0,
      sev2Defects: 0,
      issues: 2,
      riskScore: 0.1,
      milestoneCompletion: 0.75,
    },
    {
      project: 'Digital Transformation',
      spi: 0.85,
      cpi: 0.88,
      sev1Defects: 0,
      sev2Defects: 5,
      issues: 45,
      riskScore: 0.8,
      milestoneCompletion: 0.25,
    },
    {
      project: 'Customer Portal Upgrade',
      spi: 0.98,
      cpi: 1.02,
      sev1Defects: 0,
      sev2Defects: 1,
      issues: 8,
      riskScore: 0.4,
      milestoneCompletion: 0.6,
    },
    {
      project: 'Supply Chain Optimization',
      spi: 1.02,
      cpi: 1.00,
      sev1Defects: 0,
      sev2Defects: 0,
      issues: 5,
      riskScore: 0.2,
      milestoneCompletion: 0.8,
    },
  ],
  lookups: {
    statusColor: ['green', 'amber', 'red'],
    trend: ['up', 'down', 'flat'],
    statusBadge: ['Completed', 'In Progress', 'Pending', 'At Risk'],
    'spi.green': ['0.98'],
    'spi.amber': ['0.90'],
    'cpi.green': ['0.98'],
    'cpi.amber': ['0.90'],
    'quality.sev1.amber': ['0'],
    'quality.sev2.amber': ['3'],
    'risk.green': ['0.3'],
    'risk.amber': ['0.6'],
  },
};

async function seed() {
  console.log('🌱 Starting seed process...');

  try {
    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await prisma.currentSnapshot.deleteMany();
    await prisma.metrics.deleteMany();
    await prisma.milestone.deleteMany();
    await prisma.lowlight.deleteMany();
    await prisma.highlight.deleteMany();
    await prisma.status.deleteMany();
    await prisma.headers.deleteMany();
    await prisma.snapshot.deleteMany();

    console.log('📝 Creating initial snapshot...');

    // Transform to view model
    const viewModel = transformer.toViewModel(initialData);

    // Create snapshot
    const snapshotId = await versioning.createSnapshot(
      initialData,
      viewModel,
      null,
      'System',
      'Initial seed data'
    );

    console.log(`✅ Snapshot created with ID: ${snapshotId}`);

    // Verify the data
    const current = await versioning.getCurrentSnapshot();
    if (current) {
      console.log('✅ Data verification successful');
      console.log(`   - Projects: ${current.domain.status.length}`);
      console.log(`   - Highlights: ${current.domain.highlights.length}`);
      console.log(`   - Lowlights: ${current.domain.lowlights.length}`);
      console.log(`   - Milestones: ${current.domain.milestones.length}`);
      console.log(`   - Metrics: ${current.domain.metrics?.length || 0}`);
    } else {
      console.error('❌ Failed to verify data');
    }

    console.log('🎉 Seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run seed
seed().catch((error) => {
  console.error('Fatal error during seed:', error);
  process.exit(1);
});
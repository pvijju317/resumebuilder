/**
 * Ten synthetic resumes (fictional people and companies, no real PII) used to verify
 * text extraction and `vault.parse` accuracy (Phase 1 acceptance). `truth` is what a correct
 * parse must produce for roles: company, title, start and end (`YYYY-MM`, null = present).
 * Year-only dates are expected as `YYYY-01` (prompt rule in packages/ai/prompts/vault.parse).
 */

export type Layout = 'pdf-single' | 'pdf-sidebar' | 'pdf-europass' | 'docx' | 'docx-table' | 'txt';
export type DateStyle = 'mon-yyyy' | 'mm/yyyy' | 'yyyy' | 'month-yyyy' | 'yyyy-mm';

export interface Role {
  company: string;
  title: string;
  location: string;
  start: string; // YYYY-MM
  end: string | null;
  bullets: string[];
}

export interface Persona {
  id: string;
  layout: Layout;
  dateStyle: DateStyle;
  name: string;
  headline: string;
  email: string;
  phone: string;
  city: string;
  link: string;
  summary: string;
  roles: Role[];
  projects?: { name: string; bullets: string[] }[];
  education: { institution: string; degree: string; years: string }[];
  skills: string[];
  extras?: string[];
}

export const PERSONAS: Persona[] = [
  {
    id: 'r01-fresher-cs',
    layout: 'pdf-single',
    dateStyle: 'mon-yyyy',
    name: 'Kavya Menon',
    headline: 'Computer Science graduate',
    email: 'kavya.menon.dev@example.com',
    phone: '+91 98450 11223',
    city: 'Kochi, Kerala',
    link: 'github.com/kavyamenon-dev',
    summary: 'Final-year B.Tech student who enjoys building web apps end to end.',
    roles: [
      {
        company: 'Northwind Payments',
        title: 'Software Engineering Intern',
        location: 'Bengaluru',
        start: '2025-05',
        end: '2025-07',
        bullets: [
          'Built 6 React screens for merchant onboarding',
          'Wrote REST endpoints in Node.js for KYC uploads',
          'Raised dashboard test coverage from 41% to 68%',
        ],
      },
    ],
    projects: [
      {
        name: 'CampusPass',
        bullets: ['Event booking app in React and Node.js used by 900 students'],
      },
      { name: 'ShelfWise', bullets: ['PostgreSQL schema and SQL queries for a library system'] },
    ],
    education: [
      {
        institution: 'Adatum Institute of Technology',
        degree: 'B.Tech, Computer Science',
        years: '2022 - 2026',
      },
    ],
    skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'Git'],
  },
  {
    id: 'r02-data-analyst',
    layout: 'pdf-single',
    dateStyle: 'mm/yyyy',
    name: 'Rohan Iyer',
    headline: 'Data Analyst',
    email: 'rohan.iyer.data@example.com',
    phone: '+91 99001 44556',
    city: 'Pune, Maharashtra',
    link: 'linkedin.com/in/rohan-iyer-data',
    summary:
      'Analyst with four years in retail analytics, reporting automation and experimentation.',
    roles: [
      {
        company: 'Contoso Retail',
        title: 'Senior Data Analyst',
        location: 'Pune',
        start: '2023-02',
        end: null,
        bullets: [
          'Automated monthly sales reporting with Python and SQL, cutting manual effort by 63%',
          'Built 40 Tableau dashboards used weekly by 120 managers',
          'Analysed pricing experiments across 300 stores',
        ],
      },
      {
        company: 'Woodgrove Analytics',
        title: 'Data Analyst',
        location: 'Mumbai',
        start: '2021-06',
        end: '2023-01',
        bullets: [
          'Modelled 2 years of POS data into a reporting mart',
          'Cut dashboard load time from 40s to 6s',
        ],
      },
    ],
    education: [
      { institution: 'Fabrikam University', degree: 'B.Sc Statistics', years: '2018 - 2021' },
    ],
    skills: ['SQL', 'Python', 'Tableau', 'A/B testing', 'dbt'],
  },
  {
    id: 'r03-senior-pm-sidebar',
    layout: 'pdf-sidebar',
    dateStyle: 'mon-yyyy',
    name: 'Hannah Clarke',
    headline: 'Senior Product Manager',
    email: 'hannah.clarke.pm@example.com',
    phone: '+44 7700 900123',
    city: 'London',
    link: 'linkedin.com/in/hannah-clarke-pm',
    summary: 'Product leader in payments with nine years across fintech and commerce.',
    roles: [
      {
        company: 'Adatum Pay',
        title: 'Senior Product Manager',
        location: 'London',
        start: '2021-09',
        end: null,
        bullets: [
          'Set the 18-month card payments roadmap and line-managed 4 product managers',
          'Launched pay-by-bank reaching £120M payment volume in year one',
          'Reduced card payment failures by 22%',
        ],
      },
      {
        company: 'Northwind Commerce',
        title: 'Product Manager',
        location: 'Manchester',
        start: '2017-03',
        end: '2021-08',
        bullets: [
          'Raised merchant onboarding completion from 54% to 71%',
          'Wrote go-to-market plans for two SME products',
        ],
      },
      {
        company: 'Litware Labs',
        title: 'Associate Product Manager',
        location: 'Leeds',
        start: '2015-07',
        end: '2017-02',
        bullets: ['Ran 30 customer interviews to shape the invoicing MVP'],
      },
    ],
    education: [
      { institution: 'University of Tailspin', degree: 'MSc Management', years: '2014 - 2015' },
    ],
    skills: [
      'Product strategy',
      'Roadmapping',
      'Payments',
      'SQL',
      'OKRs',
      'Stakeholder management',
    ],
    extras: ['Languages: English (native), French (B2)'],
  },
  {
    id: 'r04-teacher-switcher',
    layout: 'docx',
    dateStyle: 'month-yyyy',
    name: 'Maria Lopez',
    headline: 'Educator moving into instructional design',
    email: 'maria.lopez.learning@example.com',
    phone: '+1 512 555 0188',
    city: 'Austin, TX',
    link: 'mlopez-portfolio.example.com',
    summary: 'High-school science teacher with seven years designing blended curricula.',
    roles: [
      {
        company: 'Lincoln High School',
        title: 'Science Teacher',
        location: 'Austin, TX',
        start: '2018-08',
        end: null,
        bullets: [
          'Designed a blended chemistry curriculum of 30 units',
          'Built 12 self-paced modules in Articulate Storyline',
          'Trained 25 colleagues on the school LMS',
        ],
      },
      {
        company: 'Riverside Middle School',
        title: 'Teaching Assistant',
        location: 'San Antonio, TX',
        start: '2016-09',
        end: '2018-06',
        bullets: ['Supported 4 science classes of 30 students each'],
      },
    ],
    education: [
      {
        institution: 'Tailspin State University',
        degree: 'B.Ed, Science Education',
        years: '2012 - 2016',
      },
    ],
    skills: ['Instructional design', 'Articulate Storyline', 'Assessment design', 'LMS'],
  },
  {
    id: 'r05-sales-manager-table',
    layout: 'docx-table',
    dateStyle: 'mon-yyyy',
    name: 'Vikram Shetty',
    headline: 'Regional Sales Manager, FMCG',
    email: 'vikram.shetty.sales@example.com',
    phone: '+91 90080 77889',
    city: 'Mangaluru, Karnataka',
    link: 'linkedin.com/in/vikram-shetty-sales',
    summary: 'Eleven years growing FMCG distribution across South India.',
    roles: [
      {
        company: 'Tailspin Consumer',
        title: 'Regional Sales Manager',
        location: 'Bengaluru',
        start: '2020-04',
        end: null,
        bullets: [
          'Grew regional revenue from ₹48 Cr to ₹72 Cr in 3 years',
          'Led 9 area sales managers and 60 field officers',
          'Added 35 distributors',
        ],
      },
      {
        company: 'Northwind FMCG',
        title: 'Area Sales Manager',
        location: 'Mysuru',
        start: '2014-06',
        end: '2020-03',
        bullets: ['Rolled out Salesforce for 70 users to track secondary sales'],
      },
      {
        company: 'Contoso Foods',
        title: 'Sales Officer',
        location: 'Hubballi',
        start: '2013-01',
        end: '2014-05',
        bullets: ['Opened 120 new retail outlets in the territory'],
      },
    ],
    education: [
      {
        institution: 'Fabrikam School of Business',
        degree: 'MBA, Marketing',
        years: '2011 - 2013',
      },
    ],
    skills: ['Sales management', 'Distributor management', 'Modern trade', 'Salesforce'],
  },
  {
    id: 'r06-nurse-uk',
    layout: 'pdf-single',
    dateStyle: 'month-yyyy',
    name: 'Aoife Byrne',
    headline: 'Registered Nurse, Critical Care',
    email: 'aoife.byrne.rn@example.com',
    phone: '+44 7700 900456',
    city: 'Bristol',
    link: 'linkedin.com/in/aoife-byrne-rn',
    summary: 'Critical care nurse with eight years in ICU and high-dependency settings.',
    roles: [
      {
        company: 'Westbrook General Hospital',
        title: 'Senior Staff Nurse, ICU',
        location: 'Bristol',
        start: '2019-01',
        end: null,
        bullets: [
          'Coordinated care for a 14-bed intensive care unit on night shifts',
          'Mentored 11 newly qualified nurses',
        ],
      },
      {
        company: 'Harbourside Clinic',
        title: 'Staff Nurse',
        location: 'Cardiff',
        start: '2016-09',
        end: '2018-12',
        bullets: ['Introduced a sepsis screening checklist adopted across 3 wards'],
      },
    ],
    education: [
      { institution: 'University of Westbrook', degree: 'BSc Adult Nursing', years: '2013 - 2016' },
    ],
    skills: ['Critical care', 'Patient assessment', 'Ventilator management', 'Mentoring'],
  },
  {
    id: 'r07-devops-sidebar',
    layout: 'pdf-sidebar',
    dateStyle: 'mm/yyyy',
    name: 'Arjun Nair',
    headline: 'DevOps Engineer',
    email: 'arjun.nair.ops@example.com',
    phone: '+91 97400 33221',
    city: 'Hyderabad, Telangana',
    link: 'github.com/arjunnair-ops',
    summary: 'Platform engineer focused on Kubernetes, CI/CD and cost control.',
    roles: [
      {
        company: 'Litware Cloud',
        title: 'Senior DevOps Engineer',
        location: 'Hyderabad',
        start: '2022-03',
        end: null,
        bullets: [
          'Migrated 45 services to Kubernetes with zero-downtime deploys',
          'Cut monthly AWS spend by 28%',
        ],
      },
      {
        company: 'Fabrikam Systems',
        title: 'DevOps Engineer',
        location: 'Chennai',
        start: '2020-03',
        end: '2022-02',
        bullets: [
          'Built GitHub Actions pipelines for 30 repositories',
          'Reduced build times from 25 to 9 minutes',
        ],
      },
      {
        company: 'Contoso Hosting',
        title: 'Systems Administrator',
        location: 'Chennai',
        start: '2018-07',
        end: '2020-02',
        bullets: ['Managed 200 Linux servers with Ansible'],
      },
    ],
    education: [
      {
        institution: 'Adatum College of Engineering',
        degree: 'B.E. Information Technology',
        years: '2014 - 2018',
      },
    ],
    skills: ['Kubernetes', 'Terraform', 'AWS', 'GitHub Actions', 'Ansible', 'Linux'],
  },
  {
    id: 'r08-finance-txt',
    layout: 'txt',
    dateStyle: 'yyyy-mm',
    name: 'Neha Kulkarni',
    headline: 'Financial Analyst',
    email: 'neha.kulkarni.fin@example.com',
    phone: '+91 98220 66778',
    city: 'Mumbai, Maharashtra',
    link: 'linkedin.com/in/neha-kulkarni-fin',
    summary: 'Corporate finance analyst covering FP&A, variance analysis and board reporting.',
    roles: [
      {
        company: 'Woodgrove Bank',
        title: 'Financial Analyst',
        location: 'Mumbai',
        start: '2022-07',
        end: null,
        bullets: [
          'Owned monthly variance analysis for a ₹900 Cr cost base',
          'Built a rolling forecast model in Excel used by 6 business units',
        ],
      },
      {
        company: 'Northwind Capital',
        title: 'Finance Associate',
        location: 'Mumbai',
        start: '2020-08',
        end: '2022-06',
        bullets: ['Prepared quarterly board packs'],
      },
    ],
    education: [
      {
        institution: 'Contoso College of Commerce',
        degree: 'B.Com, Accounting',
        years: '2017 - 2020',
      },
    ],
    skills: ['Financial modelling', 'Excel', 'FP&A', 'Power BI'],
  },
  {
    id: 'r09-marketing-europass',
    layout: 'pdf-europass',
    dateStyle: 'mm/yyyy',
    name: 'Lena Vogel',
    headline: 'Marketing Manager',
    email: 'lena.vogel.mkt@example.com',
    phone: '+49 151 2345 6789',
    city: 'Berlin',
    link: 'linkedin.com/in/lena-vogel-mkt',
    summary: 'B2B SaaS marketer leading demand generation across DACH markets.',
    roles: [
      {
        company: 'Tailspin Software GmbH',
        title: 'Marketing Manager',
        location: 'Berlin',
        start: '2021-04',
        end: null,
        bullets: [
          'Grew marketing-sourced pipeline by 46% year over year',
          'Managed a €600k annual campaign budget',
        ],
      },
      {
        company: 'Adatum Media',
        title: 'Content Marketing Specialist',
        location: 'Hamburg',
        start: '2018-10',
        end: '2021-03',
        bullets: ['Published 80 long-form articles; organic traffic up 3x'],
      },
    ],
    education: [
      {
        institution: 'Hochschule Fabrikam',
        degree: 'M.A. Marketing Communication',
        years: '2016 - 2018',
      },
    ],
    skills: ['Demand generation', 'HubSpot', 'SEO', 'Content strategy'],
    extras: ['Languages: German (C2), English (C1), Spanish (A2)'],
  },
  {
    id: 'r10-ux-designer',
    layout: 'docx',
    dateStyle: 'yyyy',
    name: 'Siddharth Rao',
    headline: 'Product Designer',
    email: 'siddharth.rao.ux@example.com',
    phone: '+91 96320 55443',
    city: 'Ahmedabad, Gujarat',
    link: 'siddharthrao-design.example.com',
    summary:
      'Product designer working on fintech and health apps, from research to design systems.',
    roles: [
      {
        company: 'Litware Health',
        title: 'Senior Product Designer',
        location: 'Ahmedabad',
        start: '2021-01',
        end: null,
        bullets: [
          'Led the redesign of a booking flow used by 2 lakh patients a month',
          'Built a design system of 60 components in Figma',
        ],
      },
      {
        company: 'Contoso Fintech',
        title: 'UX Designer',
        location: 'Gurugram',
        start: '2018-01',
        end: '2021-01',
        bullets: ['Ran 40 usability sessions for the lending app'],
      },
    ],
    education: [
      {
        institution: 'Fabrikam Institute of Design',
        degree: 'B.Des, Interaction Design',
        years: '2014 - 2018',
      },
    ],
    skills: ['Figma', 'User research', 'Design systems', 'Prototyping'],
  },
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function fmtDate(ym: string | null, style: DateStyle): string {
  if (!ym) return style === 'month-yyyy' ? 'Present' : 'Present';
  const [y, m] = ym.split('-') as [string, string];
  const mi = Number(m) - 1;
  switch (style) {
    case 'mon-yyyy':
      return `${MONTHS[mi]!.slice(0, 3)} ${y}`;
    case 'month-yyyy':
      return `${MONTHS[mi]} ${y}`;
    case 'mm/yyyy':
      return `${m}/${y}`;
    case 'yyyy':
      return y;
    case 'yyyy-mm':
      return ym;
  }
}

export const range = (r: Role, style: DateStyle) =>
  `${fmtDate(r.start, style)} - ${fmtDate(r.end, style)}`;

/** Ground truth for parse checks. */
export function truth(p: Persona) {
  return {
    id: p.id,
    name: p.name,
    roles: p.roles.map((r) => ({
      company: r.company,
      title: r.title,
      startDate: p.dateStyle === 'yyyy' ? `${r.start.slice(0, 4)}-01` : r.start,
      endDate: r.end === null ? null : p.dateStyle === 'yyyy' ? `${r.end.slice(0, 4)}-01` : r.end,
    })),
  };
}

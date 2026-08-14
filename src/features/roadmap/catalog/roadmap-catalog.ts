export interface CatalogSkill {
  id: string;
  name: string;
  category: string;
  description: string;
  officialDocsUrl: string;
  defaultPhases: {
    title: string;
    description: string;
    topics: string[];
  }[];
}

export const ROADMAP_CATALOG: CatalogSkill[] = [
  {
    id: 'nextjs',
    name: 'Next.js',
    category: 'Web Development',
    description: 'Full-stack React Framework for high-performance web applications.',
    officialDocsUrl: 'https://nextjs.org/docs',
    defaultPhases: [
      {
        title: 'Foundations & App Router Basics',
        description: 'Master routing, layouts, pages, server vs client components, and project structure.',
        topics: ['App Router Routing', 'Nested Layouts & Pages', 'Client vs Server Components', 'Image & Font Optimization']
      },
      {
        title: 'Data Fetching & Server Actions',
        description: 'Learn dynamic data fetching, server actions, mutation, caching, and revalidation.',
        topics: ['Server Actions & Forms', 'Data Fetching & Caching', 'Revalidation (ISR & On-demand)', 'Streaming & Suspense']
      },
      {
        title: 'Authentication & State Management',
        description: 'Secure application with JWT/session auth, middleware protection, and workspace state.',
        topics: ['Auth Middleware Protection', 'Session Cookies', 'Zustand & Context API', 'RBAC & Authorization']
      },
      {
        title: 'Production Deployment & Performance',
        description: 'Deploy on Vercel/Docker, analyze bundle sizes, configure headers, and monitor observability.',
        topics: ['Production Builds & Static Generation', 'Dockerization & Environment Variables', 'SEO & Core Web Vitals', 'Error Boundaries & Telemetry']
      }
    ]
  },
  {
    id: 'react',
    name: 'React',
    category: 'Web Development',
    description: 'The library for web and native user interfaces.',
    officialDocsUrl: 'https://react.dev',
    defaultPhases: [
      {
        title: 'React Fundamentals',
        description: 'JSX, components, props, state, event handling, and key props.',
        topics: ['JSX & Component Hierarchy', 'State & Props Management', 'Conditional Rendering', 'List Rendering & Keys']
      },
      {
        title: 'Hooks & Side Effects',
        description: 'Master useEffect, useMemo, useCallback, useRef, and custom hooks.',
        topics: ['useState & useReducer', 'useEffect Lifecycle & Cleanup', 'useMemo & useCallback Performance', 'Custom Hooks Abstraction']
      },
      {
        title: 'State Architecture & Context',
        description: 'Manage complex UI state cleanly across context providers and state machines.',
        topics: ['Context API Patterns', 'Prop Drilling Elimination', 'Global State Synchronization', 'Form Handling']
      }
    ]
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    category: 'Programming Languages',
    description: 'Typed JavaScript at Any Scale.',
    officialDocsUrl: 'https://www.typescriptlang.org/docs/',
    defaultPhases: [
      {
        title: 'Basic Types & Interfaces',
        description: 'Type annotations, interfaces, type aliases, union & intersection types.',
        topics: ['Primitive Types & Annotations', 'Interfaces vs Type Aliases', 'Unions & Intersections', 'Literal & Tuple Types']
      },
      {
        title: 'Advanced Types & Generics',
        description: 'Master generics, utility types, conditional types, and mapped types.',
        topics: ['Generic Functions & Interfaces', 'Built-in Utility Types', 'Keyof & Typeof Operators', 'Type Guard Assertion Functions']
      },
      {
        title: 'Project Setup & Strict Configuration',
        description: 'tsconfig configuration, strict mode, module resolution, and linting.',
        topics: ['tsconfig.json Best Practices', 'Strict Type Checking', 'Declaration Files (.d.ts)', 'ESLint & Prettier Integration']
      }
    ]
  },
  {
    id: 'python',
    name: 'Python',
    category: 'Programming Languages',
    description: 'Versatile language for AI, data analysis, web development, and automation.',
    officialDocsUrl: 'https://docs.python.org/3/',
    defaultPhases: [
      {
        title: 'Core Syntax & Data Structures',
        description: 'Variables, loops, functions, lists, dictionaries, tuples, and sets.',
        topics: ['Control Flow & Functions', 'Lists, Dicts, Sets & Tuples', 'List Comprehensions', 'Module Imports & Virtual Environments']
      },
      {
        title: 'Object-Oriented Programming & Async',
        description: 'Classes, inheritance, decorators, generators, and async/await syntax.',
        topics: ['Classes & Dunder Methods', 'Decorators & Generators', 'Exception Handling', 'Asyncio & Concurrency']
      },
      {
        title: 'Ecosystem & Libraries',
        description: 'Working with packages, APIs, pandas, fastAPI, and testing frameworks.',
        topics: ['Pip & Virtualenv/Poetry', 'Requests & REST APIs', 'Pytest Testing', 'Data Structures & Algorithms in Python']
      }
    ]
  },
  {
    id: 'system_design',
    name: 'System Design & Architecture',
    category: 'Software Architecture',
    description: 'Design scalable, highly available, distributed systems.',
    officialDocsUrl: 'https://owasp.org',
    defaultPhases: [
      {
        title: 'Architectural Fundamentals',
        description: 'Scalability, availability, CAP theorem, load balancing, and caching.',
        topics: ['Horizontal vs Vertical Scaling', 'Load Balancers & Reverse Proxies', 'Caching Strategies (Redis/Memcached)', 'Database Sharding & Replication']
      },
      {
        title: 'Distributed Messaging & Microservices',
        description: 'Queues, message brokers, REST vs gRPC, database patterns, and consistency.',
        topics: ['RabbitMQ & Kafka Event Streaming', 'Event-Driven Architecture', 'Service Mesh & API Gateways', 'Idempotency & Circuit Breakers']
      }
    ]
  }
];

export function getCatalogSkill(nameOrId: string): CatalogSkill | undefined {
  const query = nameOrId.toLowerCase().trim();
  return ROADMAP_CATALOG.find((item) => item.id.toLowerCase() === query || item.name.toLowerCase() === query);
}

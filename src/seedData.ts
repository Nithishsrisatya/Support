import { User, Client, Ticket, Task, Notification, AuditLog } from "./types";

export const SEED_USERS: User[] = [
  {
    id: "U-1",
    fullName: "Sarah Jenkins",
    email: "sarah@workflow.com",
    passwordHash: "sarah123", // Pre-populated password for demonstration
    role: "Administrator",
    department: "Administration",
    managerId: null,
    status: "Active",
    createdDate: "2026-01-10T09:00:00Z",
    updatedDate: "2026-01-10T09:00:00Z",
  },
  {
    id: "U-2",
    fullName: "Robert Chen",
    email: "robert@workflow.com",
    passwordHash: "robert123",
    role: "Manager",
    department: "Support & Operations",
    managerId: null,
    status: "Active",
    createdDate: "2026-01-15T11:30:00Z",
    updatedDate: "2026-01-15T11:30:00Z",
  },
  {
    id: "U-3",
    fullName: "David Kim",
    email: "david@workflow.com",
    passwordHash: "david123",
    role: "Employee",
    department: "Support & Operations",
    managerId: "U-2", // Supervised by Robert Chen
    status: "Active",
    createdDate: "2026-01-20T08:15:00Z",
    updatedDate: "2026-01-20T08:15:00Z",
  },
];

export const SEED_CLIENTS: Client[] = [
  {
    id: "C-1",
    companyName: "TechCorp Pro",
    contactPerson: "Alice Mercer",
    email: "alice@techcorp.com",
    phoneNumber: "+1 (555) 123-4567",
    status: "Active",
    createdDate: "2026-02-01T10:00:00Z",
    updatedDate: "2026-02-01T10:00:00Z",
  },
  {
    id: "C-2",
    companyName: "Quantum Solutions",
    contactPerson: "Frank Vance",
    email: "frank@quantum.com",
    phoneNumber: "+1 (555) 987-6543",
    status: "Active",
    createdDate: "2026-02-15T14:20:00Z",
    updatedDate: "2026-02-15T14:20:00Z",
  },
  {
    id: "C-3",
    companyName: "Apex Digital",
    contactPerson: "Carol Danvers",
    email: "carol@apex.com",
    phoneNumber: "+1 (555) 246-8101",
    status: "Active",
    createdDate: "2026-03-01T11:00:00Z",
    updatedDate: "2026-03-01T11:00:00Z",
  },
  {
    id: "C-4",
    companyName: "Delta Systems",
    contactPerson: "Marcus Vance",
    email: "marcus@delta.com",
    phoneNumber: "+1 (555) 357-1113",
    status: "Pending Activation",
    createdDate: "2026-06-15T16:30:00Z",
    updatedDate: "2026-06-15T16:30:00Z",
  },
];

export const SEED_TICKETS: Ticket[] = [
  {
    id: "TKT-1001",
    subject: "API connection timeout during high load",
    description: "Our backend integrations are throwing socket timeout exceptions when synchronizing bulk logs at midnight UTC. We need the network timeout threshold adjusted.",
    category: "Technical Issue",
    priority: "Low",
    status: "In Progress",
    assignedTo: "U-3", // David Kim
    clientId: "C-2", // Quantum Solutions
    createdDate: "2026-06-12T14:35:00Z",
    updatedDate: "2026-06-14T10:15:00Z",
    history: [
      {
        timestamp: "2026-06-12T14:35:00Z",
        status: "New",
        updatedBy: "Frank Vance",
        comment: "Ticket created through Web Portal.",
      },
      {
        timestamp: "2026-06-13T09:00:00Z",
        status: "Assigned",
        updatedBy: "Sarah Jenkins",
        comment: "Assigned to support technician David Kim.",
      },
      {
        timestamp: "2026-06-14T10:15:00Z",
        status: "In Progress",
        updatedBy: "David Kim",
        comment: "Analyzing nginx routing logs and test scripts.",
      },
    ],
  },
  {
    id: "TKT-1002",
    subject: "Invoice details missing tax code",
    description: "Invoice #INV-2026-059 is displaying the incorrect country code which breaks our localized compliance processing. Please regenerate with the proper credentials.",
    category: "Billing Issue",
    priority: "Medium",
    status: "New",
    assignedTo: null,
    clientId: "C-1", // TechCorp Pro
    createdDate: "2026-06-16T07:22:00Z",
    updatedDate: "2026-06-16T07:22:00Z",
    history: [
      {
        timestamp: "2026-06-16T07:22:00Z",
        status: "New",
        updatedBy: "Alice Mercer",
        comment: "Ticket submitted via compliance desk.",
      },
    ],
  },
  {
    id: "TKT-1003",
    subject: "Locked out of production dashboard",
    description: "Getting 'Account Suspended' status flags when trying to log into the main operations system. No prior notices were received. Need immediate unlock.",
    category: "Account Issue",
    priority: "High",
    status: "Assigned",
    assignedTo: "U-3", // David Kim
    clientId: "C-3", // Apex Digital
    createdDate: "2026-06-15T08:40:00Z",
    updatedDate: "2026-06-15T11:10:00Z",
    history: [
      {
        timestamp: "2026-06-15T08:40:00Z",
        status: "New",
        updatedBy: "Carol Danvers",
        comment: "Created priority support ticket.",
      },
      {
        timestamp: "2026-06-15T11:10:00Z",
        status: "Assigned",
        updatedBy: "Sarah Jenkins",
        comment: "Assigned as high urgency to David Kim.",
      },
    ],
  },
  {
    id: "TKT-1004",
    subject: "Customer gateway throwing 500 error",
    description: "All client checkouts on our live node are returning internal server errors. This is blocking primary checkout volumes. Critical SLA operational event.",
    category: "Technical Issue",
    priority: "Critical",
    status: "Resolved",
    assignedTo: "U-3", // David Kim
    clientId: "C-1", // TechCorp Pro
    createdDate: "2026-06-15T10:15:00Z",
    updatedDate: "2026-06-15T14:45:00Z",
    resolutionSummary: "Restarted load balancer proxy threads, isolated the database socket leak, and patched the index pool connection pool size.",
    resolutionDate: "2026-06-15T14:45:00Z",
    employeeNotes: "Leak was fully plugged. SLA met with 4.5h response duration.",
    history: [
      {
        timestamp: "2026-06-15T10:15:00Z",
        status: "New",
        updatedBy: "Alice Mercer",
        comment: "Emergency site down ticket recorded.",
      },
      {
        timestamp: "2026-06-15T10:30:00Z",
        status: "Assigned",
        updatedBy: "Sarah Jenkins",
        comment: "Immediate dispatch to engineer David Kim.",
      },
      {
        timestamp: "2026-06-15T10:45:00Z",
        status: "In Progress",
        updatedBy: "David Kim",
        comment: "Diagnosing application exception logs.",
      },
      {
        timestamp: "2026-06-15T14:45:00Z",
        status: "Resolved",
        updatedBy: "David Kim",
        comment: "Infrastructure service restarted and stabilized.",
      },
    ],
  },
  {
    id: "TKT-1005",
    subject: "Increase API call rate limits",
    description: "Our analytics dashboards are exceeding the standard 500 requests/minute tier limit. Requesting upgrade to Tier-3 limits (1500/min).",
    category: "Service Request",
    priority: "Medium",
    status: "Closed",
    assignedTo: "U-3", // David Kim
    clientId: "C-2", // Quantum Solutions
    createdDate: "2026-06-10T12:00:00Z",
    updatedDate: "2026-06-11T16:00:00Z",
    resolutionSummary: "Limits adjusted within security variables files and tested limits in production environment.",
    resolutionDate: "2026-06-11T15:30:00Z",
    employeeNotes: "Upgraded limits configured inside container profiles successfully.",
    satisfactionRating: 5,
    satisfactionNotes: "Exceptionally fast resolution. High productivity achieved. Thank you!",
    history: [
      {
        timestamp: "2026-06-10T12:00:00Z",
        status: "New",
        updatedBy: "Frank Vance",
        comment: "Submitted requested rates parameters.",
      },
      {
        timestamp: "2026-06-10T14:00:00Z",
        status: "Assigned",
        updatedBy: "Sarah Jenkins",
        comment: "Assigned task ticket to David Kim.",
      },
      {
        timestamp: "2026-06-11T10:15:00Z",
        status: "In Progress",
        updatedBy: "David Kim",
        comment: "Applied configuration updates.",
      },
      {
        timestamp: "2026-06-11T15:30:00Z",
        status: "Resolved",
        updatedBy: "David Kim",
        comment: "Configurations set. Confirmed connection load tests passed.",
      },
      {
        timestamp: "2026-06-11T16:00:00Z",
        status: "Closed",
        updatedBy: "Frank Vance",
        comment: "Client confirmed and closed the ticket.",
      },
    ],
  },
];

export const SEED_TASKS: Task[] = [
  {
    id: "TSK-201",
    title: "Prepare SLA Performance Report",
    description: "Analyze helpdesk ticket records and compile average resolution durations, SLA compliance scores, and resolution distributions for June.",
    taskCategory: "Administrative",
    assignedBy: "U-1", // Sarah Jenkins
    assignedTo: "U-3", // David Kim
    dueDate: "2026-06-18", // 2 days in the future
    priority: "Medium",
    status: "In Progress",
    escalationStatus: "No",
    createdDate: "2026-06-14T09:00:00Z",
    updatedDate: "2026-06-15T09:30:00Z",
  },
  {
    id: "TSK-202",
    title: "Verify Security Compliance Logs",
    description: "Perform the annual security system audit of internal administrative activities, verify MFA activation rates, and log session terminations.",
    taskCategory: "Compliance",
    assignedBy: "U-1",
    assignedTo: "U-3",
    dueDate: "2026-06-14", // Past due date relative to 2026-06-16
    priority: "High",
    status: "Escalated",
    escalationStatus: "Yes",
    createdDate: "2026-06-10T08:00:00Z",
    updatedDate: "2026-06-15T00:00:00Z", // Triggered automatically by escalation process
  },
  {
    id: "TSK-203",
    title: "Update Client Contact Information",
    description: "Consolidate the main corporate spreadsheet contacts for TechCorp Pro into the central support portal records.",
    taskCategory: "Operational",
    assignedBy: "U-1",
    assignedTo: "U-3",
    dueDate: "2026-06-19",
    priority: "Low",
    status: "Assigned",
    escalationStatus: "No",
    createdDate: "2026-06-15T11:00:00Z",
    updatedDate: "2026-06-15T11:00:00Z",
  },
  {
    id: "TSK-204",
    title: "Renew SSL Certificates for Gateway",
    description: "Coordinate with certificate vaults to refresh expiration configurations on API gateway routes.",
    taskCategory: "Support",
    assignedBy: "U-1",
    assignedTo: "U-3",
    dueDate: "2026-06-15",
    priority: "Critical",
    status: "Completed",
    escalationStatus: "No",
    completionDate: "2026-06-15T15:30:00Z",
    completionNotes: "Certificates updated, container routes refreshed. Tested connectivity on gateway endpoints.",
    createdDate: "2026-06-12T10:00:00Z",
    updatedDate: "2026-06-15T15:30:00Z",
  },
];

export const SEED_NOTIFICATIONS: Notification[] = [
  {
    id: "N-1",
    userId: "U-3", // David Kim
    notificationType: "Ticket Assignment",
    title: "New High Ticket Assigned",
    message: "Ticket TKT-1003 'Locked out of production dashboard' has been assigned to you by Administrator Sarah Jenkins.",
    status: "Read",
    createdDate: "2026-06-15T11:10:00Z",
  },
  {
    id: "N-2",
    userId: "U-3", // David Kim
    notificationType: "Task Assignment",
    title: "New Administrative Task Assigned",
    message: "Task TSK-203 'Update Client Contact Information' has been assigned to you.",
    status: "Sent",
    createdDate: "2026-06-15T11:00:00Z",
  },
  {
    id: "N-3",
    userId: "U-2", // Manager Robert Chen
    notificationType: "Escalation Alert",
    title: "Task TSK-202 Overdue Escalation",
    message: "Task TSK-202 assigned to David Kim has passed its due date (2026-06-14) and is now Escalated.",
    status: "Sent",
    createdDate: "2026-06-15T00:00:00Z",
  },
  {
    id: "N-4",
    userId: "U-1", // Sarah Jenkins
    notificationType: "Ticket Update",
    title: "New Ticket Received",
    message: "Client Alice Mercer has submitted a new Ticket TKT-1002 'Invoice details missing tax code'.",
    status: "Sent",
    createdDate: "2026-06-16T07:22:00Z",
  },
];

export const SEED_AUDIT_LOGS: AuditLog[] = [
  {
    id: "LOG-001",
    userId: "U-1",
    userFullName: "Sarah Jenkins",
    action: "Account Creation",
    entityType: "User",
    entityId: "U-3",
    timestamp: "2026-01-20T08:15:00Z",
    description: "Sarah Jenkins provisioned user account for employee David Kim in department Support & Operations.",
  },
  {
    id: "LOG-002",
    userId: "U-1",
    userFullName: "Sarah Jenkins",
    action: "Task Assignment",
    entityType: "Task",
    entityId: "TSK-202",
    timestamp: "2026-06-10T08:00:00Z",
    description: "Task TSK-202 'Verify Security Compliance Logs' assigned to David Kim.",
  },
  {
    id: "LOG-003",
    userId: "U-3",
    userFullName: "David Kim",
    action: "Ticket Update",
    entityType: "Ticket",
    entityId: "TKT-1004",
    timestamp: "2026-06-15T14:45:00Z",
    description: "David Kim resolved ticket TKT-1004: 'Customer gateway throwing 500 error'. Notes added.",
  },
  {
    id: "LOG-004",
    userId: "U-3",
    userFullName: "David Kim",
    action: "Task Update",
    entityType: "Task",
    entityId: "TSK-204",
    timestamp: "2026-06-15T15:30:00Z",
    description: "David Kim marked task TSK-204 'Renew SSL Certificates for Gateway' as Completed.",
  },
  {
    id: "LOG-005",
    userId: "U-1",
    userFullName: "Sarah Jenkins",
    action: "Account Creation",
    entityType: "Client",
    entityId: "C-4",
    timestamp: "2026-06-15T16:30:00Z",
    description: "Sarah Jenkins created Pending client portal profile for Delta Systems (Marcus Vance).",
  },
];

import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { User, Client, Ticket, Task } from "../types";
import { subDays, format } from "date-fns";

interface DashboardChartsProps {
  users?: User[];
  clients?: Client[];
  tickets?: Ticket[];
  tasks?: Task[];
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];
const PRIORITY_COLORS = {
  Critical: "#FF8042",
  High: "#FFBB28",
  Medium: "#0088FE",
  Low: "#00C49F",
};

const STATUS_COLORS = {
  New: "#0088FE",
  Assigned: "#8884d8",
  "In Progress": "#FFBB28",
  Pending: "#808080",
  Resolved: "#00C49F",
  Closed: "#a9a9a9",
};

export default function DashboardCharts({
  users = [],
  tickets = [],
  tasks = [],
}: DashboardChartsProps) {
  // --- Memoized Data Processing ---

  const trendData = useMemo(() => {
    const data = Array.from({ length: 30 })
      .map((_, i) => {
        const date = subDays(new Date(), i);
        return {
          date: format(date, "MMM dd"),
          tickets: 0,
          tasks: 0,
        };
      })
      .reverse();

    tickets.forEach((ticket) => {
      const ticketDate = format(new Date(ticket.createdDate), "MMM dd");
      const entry = data.find((d) => d.date === ticketDate);
      if (entry) {
        entry.tickets += 1;
      }
    });

    tasks.forEach((task) => {
      const taskDate = format(new Date(task.createdDate), "MMM dd");
      const entry = data.find((d) => d.date === taskDate);
      if (entry) {
        entry.tasks += 1;
      }
    });
    return data;
  }, [tickets, tasks]);

  const priorityChartData = useMemo(() => {
    const priorityData = tickets.reduce((acc, ticket) => {
      acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(priorityData).map(([name, value]) => ({
      name,
      value,
    }));
  }, [tickets]);

  const statusChartData = useMemo(() => {
    const statusData = tickets.reduce((acc, ticket) => {
      acc[ticket.status] = (acc[ticket.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(statusData).map(([name, value]) => ({
      name,
      value,
    }));
  }, [tickets]);

  const workloadData = useMemo(() => {
    return users
      .filter((u) => u.role === "Employee")
      .map((user) => {
        const openTickets = tickets.filter(
          (t) =>
            t.assignedTo === user.id &&
            t.status !== "Closed" &&
            t.status !== "Resolved"
        ).length;
        const openTasks = tasks.filter(
          (t) => t.assignedTo === user.id && t.status !== "Completed"
        ).length;
        return {
          name: user.fullName.split(" ")[0], // Short name
          tickets: openTickets,
          tasks: openTasks,
        };
      });
  }, [users, tickets, tasks]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-zinc-800 bg-[#18181B] p-5 shadow-lg">
        <h4 className="text-sm font-bold text-zinc-200 tracking-tight mb-4">
          Ticket & Task Creation Trends (Last 30 Days)
        </h4>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
            <YAxis stroke="#9ca3af" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                borderColor: "#374151",
              }}
            />
            <Legend />
            <Line type="monotone" dataKey="tickets" stroke="#38bdf8" name="New Tickets" />
            <Line type="monotone" dataKey="tasks" stroke="#34d399" name="New Tasks" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-[#18181B] p-5 shadow-lg">
        <h4 className="text-sm font-bold text-zinc-200 tracking-tight mb-4">
          Employee Workload (Open Items)
        </h4>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={workloadData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
            <YAxis stroke="#9ca3af" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                borderColor: "#374151",
              }}
            />
            <Legend />
            <Bar dataKey="tickets" fill="#818cf8" name="Open Tickets" />
            <Bar dataKey="tasks" fill="#60a5fa" name="Open Tasks" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-[#18181B] p-5 shadow-lg">
        <h4 className="text-sm font-bold text-zinc-200 tracking-tight mb-4">
          Ticket Priority Distribution
        </h4>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={priorityChartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
            >
              {priorityChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={PRIORITY_COLORS[entry.name as keyof typeof PRIORITY_COLORS] || COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                borderColor: "#374151",
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-[#18181B] p-5 shadow-lg">
        <h4 className="text-sm font-bold text-zinc-200 tracking-tight mb-4">
          Ticket Status Overview
        </h4>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={statusChartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
            >
              {statusChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS] || COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                borderColor: "#374151",
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
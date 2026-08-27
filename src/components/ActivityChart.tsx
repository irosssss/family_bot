import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Completion, Task, User } from '../types';
import { BarChart3 } from 'lucide-react';
import { DAYS_SHORT } from '../data/initialData';

interface ActivityChartProps {
 completions: Completion[];
 tasks: Task[];
 users: User[];
}

export const ActivityChart: React.FC<ActivityChartProps> = ({ completions = [], tasks = [], users = [] }) => {
 const safeCompletions = Array.isArray(completions) ? completions : [];
 const safeTasks = Array.isArray(tasks) ? tasks : [];

 // Generate data for the past 7 days
 const daysData = [];
 const today = new Date();

 for (let i = 6; i >= 0; i--) {
 const d = new Date(today);
 d.setDate(today.getDate() - i);
 const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
 d.getDate()
 ).padStart(2, '0')}`;
 const dayName = DAYS_SHORT[d.getDay() === 0 ? 6 : d.getDay() - 1];

 let mishaPoints = 0;
 let reginaPoints = 0;

 safeCompletions.forEach((c) => {
 if (c && c.completed_at === dayStr) {
 const task = safeTasks.find((t) => t.id === c.task_id);
 const pts = task?.points || 1;
 if (c.user_id === 1) {
 mishaPoints += pts;
 } else if (c.user_id === 2) {
 reginaPoints += pts;
 }
 }
 });

 daysData.push({
 date: dayStr,
 day: dayName,
 'Миша ': mishaPoints,
 'Регина ': reginaPoints,
 total: mishaPoints + reginaPoints,
 });
 }

 return (
 <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-2">
 <BarChart3 className="w-5 h-5 text-indigo-400" />
 <h3 className="text-base font-bold text-white tracking-tight">Баллы за 7 дней</h3>
 </div>
 <span className="text-xs text-slate-400">Командный вклад по дням</span>
 </div>

 <div className="h-56 w-full">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={daysData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
 <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
 <XAxis dataKey="day" stroke="#8b93a7" fontSize={12} tickLine={false} />
 <YAxis stroke="#8b93a7" fontSize={12} tickLine={false} axisLine={false} />
 <Tooltip
 contentStyle={{
 backgroundColor: '#171c28',
 borderColor: 'rgba(255,255,255,0.1)',
 borderRadius: '12px',
 color: '#fff',
 fontSize: '12px',
 }}
 cursor={{ fill: 'rgba(255,255,255,0.05)' }}
 />
 <Legend
 wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
 iconType="circle"
 formatter={(value) => <span className="text-slate-300 font-medium">{value}</span>}
 />
 <Bar dataKey="Миша " fill="#4f8cff" radius={[4, 4, 0, 0]} maxBarSize={28} />
 <Bar dataKey="Регина " fill="#f56ea6" radius={[4, 4, 0, 0]} maxBarSize={28} />
 </BarChart>
 </ResponsiveContainer>
 </div>
 </div>
 );
};

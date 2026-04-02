interface StatsCardProps {
  label: string;
  value: string | number;
  change?: string;
  positive?: boolean;
  color?: 'purple' | 'green' | 'red' | 'blue' | 'amber';
}

export default function StatsCard({
  label,
  value,
  change,
  positive,
  color = 'purple',
}: StatsCardProps) {
  return (
    <div className="card stat-card animate-in" data-color={color}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {change && (
        <p className={`stat-change ${positive ? 'positive' : 'negative'}`}>
          {positive ? '↑' : '↓'} {change}
        </p>
      )}
    </div>
  );
}

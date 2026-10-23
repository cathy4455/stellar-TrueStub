"use client";

import { DollarSign, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EscrowData } from './RoleEscrowDashboard';
import { useTranslation } from 'react-i18next';
import { formatEscrowAmount } from '@/lib/formatEscrowAmount';

interface EscrowsByStatusProps {
  escrows: EscrowData[];
  userRole: 'guest' | 'event' | 'admin';
}

export function EscrowsByStatus({ escrows, userRole }: EscrowsByStatusProps) {
  const { t } = useTranslation();

  const stats = {
    total: escrows.length,
    pending: escrows.filter(e => e.status === 'pending').length,
    funded: escrows.filter(e => e.status === 'funded').length,
    completed: escrows.filter(e => e.status === 'completed').length,
    cancelled: escrows.filter(e => e.status === 'cancelled').length,
  };

  // Totals are kept per asset — summing XLM and USDC into one number is meaningless.
  const getTotalAmount = () => {
    const totals: Record<string, number> = {};
    for (const escrow of escrows) {
      if (escrow.status === 'cancelled') continue;
      const code = escrow.asset?.code ?? 'USDC';
      totals[code] = (totals[code] ?? 0) + escrow.amount;
    }
    const entries = Object.entries(totals);
    if (entries.length === 0) return formatEscrowAmount(0, 'USDC');
    return entries.map(([code, amount]) => formatEscrowAmount(amount, code)).join(' · ');
  };

  const getStatusStats = () => {
    if (userRole === 'guest') {
      return [
        { 
          title: t('dashboard.active'),
          value: stats.pending + stats.funded,
          icon: Clock,
          color: 'text-blue-500',
          description: t('dashboard.active'),
        },
        { 
          title: t('dashboard.completed'),
          value: stats.completed,
          icon: CheckCircle,
          color: 'text-green-500',
          description: t('dashboard.completed'),
        },
      ];
    }

    if (userRole === 'event') {
      return [
        { 
          title: t('dashboard.statusPending'),
          value: stats.pending,
          icon: Clock,
          color: 'text-yellow-500',
          description: t('dashboard.statusPending'),
        },
        { 
          title: t('dashboard.active'),
          value: stats.funded,
          icon: AlertCircle,
          color: 'text-blue-500',
          description: t('dashboard.active'),
        },
      ];
    }

    // Admin view
    return [
      { 
        title: t('dashboard.active'),
        value: stats.pending + stats.funded,
        icon: AlertCircle,
        color: 'text-blue-500',
        description: t('dashboard.active'),
      },
      { 
        title: t('dashboard.completed'),
        value: stats.completed,
        icon: CheckCircle,
        color: 'text-green-500',
        description: t('dashboard.completed'),
      },
      { 
        title: t('dashboard.cancelled'),
        value: stats.cancelled,
        icon: XCircle,
        color: 'text-red-500',
        description: t('dashboard.cancelled'),
      },
    ];
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium dark:text-white">
            {t('dashboard.totalValue')}
          </CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold dark:text-white">
            {getTotalAmount()}
          </div>
          <p className="text-xs text-muted-foreground">
            {stats.total} {t('dashboard.totalEscrows')}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {getStatusStats().map((stat, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium dark:text-white">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold dark:text-white">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

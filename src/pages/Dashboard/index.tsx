import React from 'react';
import styles from './DashboardOverview.module.css';

interface DashboardOverviewProps {
  token: string | null;
}

function DashboardOverview({ token }: DashboardOverviewProps) {
  

  if (!token) {
    return null;
  }

  return (
    <div className={styles.container}>
      {}
    </div>
  );
}

export default DashboardOverview;

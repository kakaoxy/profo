import React from 'react';
import Sidebar from './components/Sidebar';
import RightSidebar from './components/RightSidebar';
import DashboardContent from './components/DashboardContent';

export default function App() {
  return (
    <div className="flex h-screen w-full bg-white overflow-hidden font-sans">
      <Sidebar />
      <DashboardContent />
      <RightSidebar />
    </div>
  );
}
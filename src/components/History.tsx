import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  History as HistoryIcon, 
  Trash2, 
  ChevronRight, 
  Calendar, 
  Zap, 
  Activity, 
  Ruler, 
  Cpu, 
  Waves,
  Search,
  X,
  FileText,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { CalculationHistory } from '../types';
import { getHistory, deleteHistoryItem } from '../services/historyService';

interface HistoryProps {
  onSelect: (item: CalculationHistory) => void;
}

export default function History({ onSelect }: HistoryProps) {
  const [history, setHistory] = useState<CalculationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<CalculationHistory | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await getHistory();
        setHistory(data);
      } catch (error) {
        console.error('Error fetching history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    window.addEventListener('bs7671-history-updated', fetchHistory);
    return () => window.removeEventListener('bs7671-history-updated', fetchHistory);
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteHistoryItem(null, id);
      setHistory(prev => prev.filter(item => item.id !== id));
      if (selectedItem?.id === id) setSelectedItem(null);
    } catch (error) {
      console.error('Error deleting history item:', error);
    }
  };

  const filteredHistory = history.filter(item => 
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTypeIcon = (type: CalculationHistory['type']) => {
    switch (type) {
      case 'circuit': return <Zap className="text-emerald-500" size={18} />;
      case 'zs': return <Activity className="text-blue-500" size={18} />;
      case 'fault': return <AlertTriangle className="text-orange-500" size={18} />;
      case 'three-phase': return <Cpu className="text-purple-500" size={18} />;
      case 'electrode': return <Waves className="text-cyan-500" size={18} />;
      default: return <FileText className="text-gray-500" size={18} />;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <input 
          type="text"
          placeholder="Search history..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-hardware-card border border-hardware-border rounded-2xl pl-12 pr-4 py-4 text-white font-medium focus:border-emerald-500/50 transition-colors outline-none"
        />
      </div>

      {/* History List */}
      <div className="space-y-3">
        {filteredHistory.length === 0 ? (
          <div className="text-center py-12 bg-hardware-card rounded-3xl border border-hardware-border">
            <HistoryIcon className="mx-auto text-gray-600 mb-4" size={48} />
            <p className="text-gray-500 font-medium">No calculation history found</p>
          </div>
        ) : (
          filteredHistory.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setSelectedItem(item)}
              className="bg-hardware-card p-4 rounded-2xl border border-hardware-border hover:border-emerald-500/30 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-black/40 rounded-xl flex items-center justify-center">
                    {getTypeIcon(item.type)}
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors">{item.title}</h4>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                      <Calendar size={10} />
                      {formatDate(item.createdAt)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => handleDelete(e, item.id)}
                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                  <ChevronRight className="text-gray-600 group-hover:text-emerald-500 transition-colors" size={18} />
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-lg bg-hardware-card border border-hardware-border rounded-t-[40px] sm:rounded-[40px] p-8 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-black/40 rounded-2xl flex items-center justify-center">
                    {getTypeIcon(selectedItem.type)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{selectedItem.title}</h3>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{formatDate(selectedItem.createdAt)}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedItem(null)} className="p-2 bg-white/5 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Inputs */}
                <div>
                  <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-3">Input Parameters</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(selectedItem.inputs).map(([key, value]) => (
                      <div key={key} className="p-3 bg-black/40 rounded-xl border border-white/5">
                        <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                        <p className="text-sm font-mono font-bold text-white">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Results */}
                <div>
                  <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-3">Calculation Results</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(selectedItem.results).map(([key, value]) => {
                      if (key === 'isCompliant' || key === 'zsCompliant' || key === 'isAdequate' || key === 'isStable') return null;
                      return (
                        <div key={key} className="p-3 bg-black/40 rounded-xl border border-white/5">
                          <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                          <p className="text-sm font-mono font-bold text-white">
                            {typeof value === 'number' ? value.toFixed(2) : String(value)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Status */}
                {(selectedItem.results.isCompliant !== undefined || selectedItem.results.isAdequate !== undefined) && (
                  <div className={`p-4 rounded-2xl border ${
                    (selectedItem.results.isCompliant || selectedItem.results.isAdequate) 
                      ? 'bg-emerald-500/10 border-emerald-500/20' 
                      : 'bg-red-500/10 border-red-500/20'
                  }`}>
                    <div className="flex items-center gap-3">
                      {(selectedItem.results.isCompliant || selectedItem.results.isAdequate) ? (
                        <CheckCircle2 className="text-emerald-500" size={20} />
                      ) : (
                        <AlertTriangle className="text-red-500" size={20} />
                      )}
                      <div>
                        <p className="text-sm font-bold text-white">
                          {(selectedItem.results.isCompliant || selectedItem.results.isAdequate) ? 'COMPLIANT' : 'NON-COMPLIANT'}
                        </p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Safety Standard Check</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

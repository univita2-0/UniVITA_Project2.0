// src/screens/MyPayrollScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator,
  RefreshControl, Modal, TouchableOpacity, Dimensions
} from 'react-native';
import { CalendarDays, X, FileText, ChevronRight, Wallet, TrendingDown, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchEmployeePayrollHistory } from './api';

const { width } = Dimensions.get('window');

export default function MyPayrollScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allPayslips, setAllPayslips] = useState([]);

  // Modal states
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  const loadData = useCallback(async () => {
    try {
      const employeeId = await AsyncStorage.getItem('employee_id');
      if (employeeId) {
        const data = await fetchEmployeePayrollHistory(employeeId);
        setAllPayslips(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('My Payroll load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const currentMonthPayslip = allPayslips.find(record => record.month_year === currentMonth);
  const pastPayslips = allPayslips.filter(record => record.month_year !== currentMonth);

  const openDetailModal = (record) => {
    setSelectedPayslip(record);
    setShowDetailModal(true);
  };

  const formatCurrency = (value) => {
    const num = Number(value || 0);
    return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Modern Card for the Current Month
  const renderCurrentMonthCard = (record) => {
    const totalDeductions = (record.sss_deduction || 0) + (record.philhealth_deduction || 0) + 
                            (record.pagibig_deduction || 0) + (record.tax_deduction || 0) + 
                            (record.loan_deduction || 0) + (record.other_deduction || 0);

    return (
      <View style={styles.primaryCard}>
        <View style={styles.primaryCardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={styles.iconCircle}>
              <Wallet size={20} color="#0D9488" />
            </View>
            <Text style={styles.primaryCardTitle}>{record.month_year}</Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>FINALIZED</Text>
          </View>
        </View>

        <View style={styles.primaryCardBody}>
          <Text style={styles.netPayLabel}>Net Take-Home Pay</Text>
          <Text style={styles.netPayValue}>{formatCurrency(record.net_pay)}</Text>
        </View>

        <View style={styles.primaryCardFooter}>
          <View style={styles.footerItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <ArrowDownToLine size={14} color="#D1FAE5" />
              <Text style={styles.footerLabel}>Gross Pay</Text>
            </View>
            <Text style={styles.footerValue}>{formatCurrency(record.gross_pay)}</Text>
          </View>
          <View style={styles.footerDivider} />
          <View style={styles.footerItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <ArrowUpFromLine size={14} color="#FECACA" />
              <Text style={styles.footerLabel}>Deductions</Text>
            </View>
            <Text style={styles.footerValue}>{formatCurrency(totalDeductions)}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.viewDetailsBtn} onPress={() => openDetailModal(record)} activeOpacity={0.8}>
          <Text style={styles.viewDetailsBtnText}>View Full Payslip</Text>
          <ChevronRight size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    );
  };

  // Minimal List Item for Past Payslips
  const renderPastPayslipItem = (record) => (
    <TouchableOpacity 
      style={styles.historyItem} 
      onPress={() => openDetailModal(record)}
      activeOpacity={0.7}
      key={record.id}
    >
      <View style={styles.historyIconWrapper}>
        <FileText size={20} color="#64748B" />
      </View>
      <View style={styles.historyInfo}>
        <Text style={styles.historyMonth}>{record.month_year}</Text>
        <Text style={styles.historyHours}>{Number(record.total_hours || 0).toFixed(1)} hrs • {Number(record.overtime_hours || 0).toFixed(1)} OT</Text>
      </View>
      <View style={styles.historyAmountWrapper}>
        <Text style={styles.historyAmount}>{formatCurrency(record.net_pay)}</Text>
        <ChevronRight size={18} color="#CBD5E1" />
      </View>
    </TouchableOpacity>
  );

  const renderDetailModal = () => {
    if (!selectedPayslip) return null;
    const p = selectedPayslip;
    const totalDeductions = (p.sss_deduction || 0) + (p.philhealth_deduction || 0) + (p.pagibig_deduction || 0) +
                            (p.tax_deduction || 0) + (p.loan_deduction || 0) + (p.other_deduction || 0);

    return (
      <Modal visible={showDetailModal} animationType="slide" transparent onRequestClose={() => setShowDetailModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModalContainer}>
            
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Payslip Details</Text>
                <Text style={styles.modalSubtitle}>{p.month_year}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDetailModal(false)} style={styles.closeButton}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              
              {/* Earnings Breakdown */}
              <View style={styles.receiptSection}>
                <Text style={styles.sectionTitle}>Earnings</Text>
                
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Basic Pay (Rate × Hours)</Text>
                  <Text style={styles.receiptValue}>{formatCurrency(p.gross_pay - (p.overtime_pay || 0))}</Text>
                </View>
                {Number(p.overtime_pay) > 0 && (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Overtime Pay</Text>
                    <Text style={styles.receiptValue}>{formatCurrency(p.overtime_pay)}</Text>
                  </View>
                )}
                {Number(p.transport_allowance) > 0 && (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Transport Allowance</Text>
                    <Text style={styles.receiptValue}>{formatCurrency(p.transport_allowance)}</Text>
                  </View>
                )}
                {Number(p.meal_allowance) > 0 && (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Meal Allowance</Text>
                    <Text style={styles.receiptValue}>{formatCurrency(p.meal_allowance)}</Text>
                  </View>
                )}
                {Number(p.housing_allowance) > 0 && (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Housing Allowance</Text>
                    <Text style={styles.receiptValue}>{formatCurrency(p.housing_allowance)}</Text>
                  </View>
                )}
                
                <View style={styles.receiptDivider} />
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabelBold}>Gross Pay</Text>
                  <Text style={styles.receiptValueBold}>{formatCurrency(p.gross_pay)}</Text>
                </View>
              </View>

              {/* Deductions Breakdown */}
              <View style={styles.receiptSection}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <TrendingDown size={18} color="#EF4444" />
                  <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Deductions</Text>
                </View>
                
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Withholding Tax</Text>
                  <Text style={styles.receiptValueRed}>-{formatCurrency(p.tax_deduction)}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>SSS Contribution</Text>
                  <Text style={styles.receiptValueRed}>-{formatCurrency(p.sss_deduction)}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>PhilHealth</Text>
                  <Text style={styles.receiptValueRed}>-{formatCurrency(p.philhealth_deduction)}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Pag-IBIG</Text>
                  <Text style={styles.receiptValueRed}>-{formatCurrency(p.pagibig_deduction)}</Text>
                </View>
                {Number(p.loan_deduction) > 0 && (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Loan Deduction</Text>
                    <Text style={styles.receiptValueRed}>-{formatCurrency(p.loan_deduction)}</Text>
                  </View>
                )}
                {Number(p.other_deduction) > 0 && (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Other Deductions</Text>
                    <Text style={styles.receiptValueRed}>-{formatCurrency(p.other_deduction)}</Text>
                  </View>
                )}
                
                <View style={styles.receiptDivider} />
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabelBold}>Total Deductions</Text>
                  <Text style={[styles.receiptValueBold, { color: '#EF4444' }]}>-{formatCurrency(totalDeductions)}</Text>
                </View>
              </View>

              {/* Net Pay Highlight */}
              <View style={styles.netPayHighlight}>
                <Text style={styles.netPayHighlightLabel}>Net Take-Home Pay</Text>
                <Text style={styles.netPayHighlightValue}>{formatCurrency(p.net_pay)}</Text>
              </View>

              <Text style={styles.footnote}>
                * Absent and late deductions are already factored into the total hours and basic pay calculation.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D9488" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#0D9488"]} />}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Payroll</Text>
          <Text style={styles.headerSubtitle}>View and track your finalized payslips</Text>
        </View>

        {/* Current Month Section */}
        <Text style={styles.sectionHeading}>Current Period</Text>
        {currentMonthPayslip ? (
          renderCurrentMonthCard(currentMonthPayslip)
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrapper}>
              <CalendarDays size={32} color="#94A3B8" />
            </View>
            <Text style={styles.emptyText}>No payslip yet</Text>
            <Text style={styles.emptySubtext}>
              Your payslip will appear here once HR finalizes the payroll for {currentMonth}.
            </Text>
          </View>
        )}

        {/* Past Payslips Section */}
        {pastPayslips.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionHeading}>Previous Payslips</Text>
            <View style={styles.historyList}>
              {pastPayslips.map(record => renderPastPayslipItem(record))}
            </View>
          </View>
        )}
      </ScrollView>

      {renderDetailModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, paddingBottom: 40 },
  
  header: { marginBottom: 24, marginTop: 10 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },

  sectionHeading: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 12, marginTop: 8 },

  // Primary Card (Current Month)
  primaryCard: {
    backgroundColor: '#0D9488',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 24,
  },
  primaryCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  primaryCardTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  statusBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  
  primaryCardBody: { alignItems: 'center', marginBottom: 24 },
  netPayLabel: { fontSize: 13, color: '#CCFBF1', fontWeight: '500', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  netPayValue: { fontSize: 40, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1 },

  primaryCardFooter: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 12, padding: 16, marginBottom: 16 },
  footerItem: { flex: 1, alignItems: 'center' },
  footerDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 10 },
  footerLabel: { fontSize: 12, color: '#CCFBF1', fontWeight: '500' },
  footerValue: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  viewDetailsBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 8 },
  viewDetailsBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },

  // Empty State
  emptyCard: { alignItems: 'center', padding: 32, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', marginBottom: 24 },
  emptyIconWrapper: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#334155', marginBottom: 8 },
  emptySubtext: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20 },

  // History List
  historySection: { marginTop: 10 },
  historyList: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  historyItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  historyIconWrapper: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  historyInfo: { flex: 1 },
  historyMonth: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  historyHours: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  historyAmountWrapper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyAmount: { fontSize: 15, fontWeight: '700', color: '#0F172A' },

  // Detail Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  detailModalContainer: { backgroundColor: '#FAFAFA', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%', minHeight: '60%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  modalSubtitle: { fontSize: 14, color: '#64748B', fontWeight: '500', marginTop: 2 },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },

  receiptSection: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  receiptLabel: { fontSize: 13, color: '#4B5563', fontWeight: '500' },
  receiptValue: { fontSize: 13, color: '#0F172A', fontWeight: '600' },
  receiptValueRed: { fontSize: 13, color: '#EF4444', fontWeight: '600' },
  receiptDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 12, borderStyle: 'dashed' },
  receiptLabelBold: { fontSize: 14, color: '#0F172A', fontWeight: '700' },
  receiptValueBold: { fontSize: 14, color: '#0F172A', fontWeight: '800' },

  netPayHighlight: { backgroundColor: '#0D9488', borderRadius: 16, padding: 20, alignItems: 'center', marginTop: 8, marginBottom: 20 },
  netPayHighlightLabel: { fontSize: 13, color: '#CCFBF1', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  netPayHighlightValue: { fontSize: 32, color: '#FFFFFF', fontWeight: '800', letterSpacing: -1 },

  footnote: { fontSize: 11, color: '#94A3B8', textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 20, lineHeight: 16 },
});
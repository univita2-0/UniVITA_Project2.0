// src/screens/MyPayrollScreen.js
import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator,
  RefreshControl, Modal, TouchableOpacity, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, X, FileText, ChevronRight, Wallet, TrendingDown, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { fetchEmployeePayrollHistory } from './api';

export default function MyPayrollScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allPayslips, setAllPayslips] = useState([]);

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

  const renderCurrentMonthCard = (record) => {
    const totalDeductions = Number(record.sss_deduction || 0) + Number(record.philhealth_deduction || 0) + 
                            Number(record.pagibig_deduction || 0) + Number(record.tax_deduction || 0) + 
                            Number(record.loan_deduction || 0) + Number(record.other_deduction || 0);

    return (
      <View style={styles.primaryCard}>
        <View style={styles.primaryCardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.iconCircle}>
              <Wallet size={20} color={isLight ? "#0F172A" : "#FFFFFF"} strokeWidth={1.5} />
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <ArrowDownToLine size={14} color={isLight ? "#059669" : "#34D399"} />
              <Text style={styles.footerLabel}>Gross Pay</Text>
            </View>
            <Text style={styles.footerValue}>{formatCurrency(record.gross_pay)}</Text>
          </View>
          <View style={styles.footerDivider} />
          <View style={styles.footerItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <ArrowUpFromLine size={14} color={isLight ? "#DC2626" : "#F87171"} />
              <Text style={styles.footerLabel}>Deductions</Text>
            </View>
            <Text style={styles.footerValue}>{formatCurrency(totalDeductions)}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.viewDetailsBtn} onPress={() => openDetailModal(record)} activeOpacity={0.85}>
          <Text style={styles.viewDetailsBtnText}>View Full Payslip</Text>
          <ChevronRight size={18} color={isLight ? "#0F172A" : colors.textPrimary} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderPastPayslipItem = (record) => (
    <TouchableOpacity 
      style={styles.historyItem} 
      onPress={() => openDetailModal(record)}
      activeOpacity={0.7}
      key={record.id}
    >
      <View style={styles.historyIconWrapper}>
        <FileText size={20} color={isLight ? "#64748B" : colors.textSecondary} strokeWidth={1.5} />
      </View>
      <View style={styles.historyInfo}>
        <Text style={styles.historyMonth}>{record.month_year}</Text>
        <Text style={styles.historyHours}>{Number(record.total_hours || 0).toFixed(1)} hrs • {Number(record.overtime_hours || 0).toFixed(1)} OT</Text>
      </View>
      <View style={styles.historyAmountWrapper}>
        <Text style={styles.historyAmount}>{formatCurrency(record.net_pay)}</Text>
        <ChevronRight size={18} color={isLight ? "#CBD5E1" : colors.border} />
      </View>
    </TouchableOpacity>
  );

  const renderDetailModal = () => {
    if (!selectedPayslip) return null;
    const p = selectedPayslip;
    const totalDeductions = Number(p.sss_deduction || 0) + Number(p.philhealth_deduction || 0) + Number(p.pagibig_deduction || 0) +
                            Number(p.tax_deduction || 0) + Number(p.loan_deduction || 0) + Number(p.other_deduction || 0);

    return (
      <Modal visible={showDetailModal} animationType="fade" transparent onRequestClose={() => setShowDetailModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModalContainer}>
            
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Payslip Details</Text>
                <Text style={styles.modalSubtitle}>{p.month_year}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDetailModal(false)} style={styles.closeButton} activeOpacity={0.8}>
                <X size={20} color={isLight ? "#64748B" : colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              
              <View style={styles.receiptSection}>
                <Text style={styles.sectionTitle}>Earnings</Text>
                
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Base Earnings</Text>
                  <Text style={styles.receiptValue}>{formatCurrency(Number(p.gross_pay) - Number(p.overtime_pay || 0))}</Text>
                </View>
                {Number(p.overtime_pay) > 0 && (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Overtime Pay</Text>
                    <Text style={styles.receiptValue}>{formatCurrency(p.overtime_pay)}</Text>
                  </View>
                )}
                
                <View style={styles.receiptDivider} />
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabelPremium}>Gross Pay</Text>
                  <Text style={styles.receiptValuePremium}>{formatCurrency(p.gross_pay)}</Text>
                </View>
              </View>

              <View style={styles.receiptSection}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <TrendingDown size={18} color={isLight ? "#EF4444" : "#F87171"} strokeWidth={1.5} />
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
                  <Text style={styles.receiptLabelPremium}>Total Deductions</Text>
                  <Text style={[styles.receiptValuePremium, { color: isLight ? '#EF4444' : '#F87171' }]}>-{formatCurrency(totalDeductions)}</Text>
                </View>
              </View>

              <View style={styles.netPayHighlight}>
                <Text style={styles.netPayHighlightLabel}>Net Take-Home Pay</Text>
                <Text style={styles.netPayHighlightValue}>{formatCurrency(p.net_pay)}</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={isLight ? "#0F172A" : colors.textPrimary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isLight ? "#0F172A" : colors.textPrimary} />}
        >
          <Text style={styles.sectionHeading}>Current Period</Text>
          {currentMonthPayslip ? (
            renderCurrentMonthCard(currentMonthPayslip)
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrapper}>
                <CalendarDays size={32} color={isLight ? "#94A3B8" : colors.textSecondary} strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyText}>No payslip yet</Text>
              <Text style={styles.emptySubtext}>
                Your payslip will appear here once HR finalizes the payroll for {currentMonth}.
              </Text>
            </View>
          )}

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
    </>
  );
}

const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isLight ? '#F8FAFC' : colors.background },
  scroll: { paddingHorizontal: 24, paddingBottom: 80, paddingTop: 16 },
  sectionHeading: { fontFamily: 'Inter_18pt-Medium', fontSize: 18, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 20, letterSpacing: -0.5 },
  
  primaryCard: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 32, padding: 24, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, marginBottom: 36, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isLight ? 0.04 : 0.15, shadowRadius: 24, elevation: 6 },
  primaryCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, justifyContent: 'center', alignItems: 'center' },
  primaryCardTitle: { fontFamily: 'Inter_18pt-Medium', fontSize: 16, color: isLight ? '#0F172A' : colors.textPrimary },
  statusBadge: { backgroundColor: isLight ? '#F8FAFC' : colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  statusText: { fontFamily: 'Inter_18pt-Medium', fontSize: 10, color: isLight ? '#64748B' : colors.textSecondary, letterSpacing: 1 },
  
  primaryCardBody: { alignItems: 'center', marginBottom: 32 },
  netPayLabel: { fontFamily: 'Inter_18pt-Regular', fontSize: 13, color: isLight ? '#64748B' : colors.textSecondary, letterSpacing: 0.5, marginBottom: 8, includeFontPadding: false },
  netPayValue: { fontFamily: 'Inter_18pt-Medium', fontSize: 44, color: isLight ? '#0F172A' : colors.textPrimary, letterSpacing: -1.5, includeFontPadding: false, lineHeight: 48 },
  
  primaryCardFooter: { flexDirection: 'row', backgroundColor: isLight ? '#F8FAFC' : colors.background, borderRadius: 20, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  footerItem: { flex: 1, alignItems: 'center' },
  footerDivider: { width: 1, backgroundColor: isLight ? '#E2E8F0' : colors.border, marginHorizontal: 10 },
  footerLabel: { fontFamily: 'Inter_18pt-Regular', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary },
  footerValue: { fontFamily: 'Inter_18pt-Medium', fontSize: 16, color: isLight ? '#0F172A' : colors.textPrimary },
  
  viewDetailsBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 12, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, borderRadius: 16 },
  viewDetailsBtnText: { fontFamily: 'Inter_18pt-Medium', color: isLight ? '#0F172A' : colors.textPrimary, fontSize: 14 },
  
  emptyCard: { alignItems: 'center', padding: 40, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 32, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, borderStyle: 'dashed', marginBottom: 36 },
  emptyIconWrapper: { width: 64, height: 64, borderRadius: 32, backgroundColor: isLight ? '#F8FAFC' : colors.iconBg, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyText: { fontFamily: 'Inter_18pt-Medium', fontSize: 16, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 8 },
  emptySubtext: { fontFamily: 'Inter_18pt-Regular', fontSize: 14, color: isLight ? '#64748B' : colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  
  historySection: { marginTop: 8 },
  historyList: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 32, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isLight ? 0.02 : 0.1, shadowRadius: 16, elevation: 2 },
  historyItem: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: isLight ? '#F8FAFC' : colors.border },
  historyIconWrapper: { width: 46, height: 46, borderRadius: 16, backgroundColor: isLight ? '#F8FAFC' : colors.background, justifyContent: 'center', alignItems: 'center', marginRight: 16, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  historyInfo: { flex: 1 },
  historyMonth: { fontFamily: 'Inter_18pt-Medium', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 4 },
  historyHours: { fontFamily: 'Inter_18pt-Regular', fontSize: 13, color: isLight ? '#64748B' : colors.textSecondary },
  historyAmountWrapper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyAmount: { fontFamily: 'Inter_18pt-Medium', fontSize: 16, color: isLight ? '#0F172A' : colors.textPrimary },
  
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  detailModalContainer: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 32, padding: 28, width: '100%', maxWidth: 420, maxHeight: '85%', borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  modalTitle: { fontFamily: 'Inter_18pt-Medium', fontSize: 22, color: isLight ? '#0F172A' : colors.textPrimary, letterSpacing: -0.5 },
  modalSubtitle: { fontFamily: 'Inter_18pt-Regular', fontSize: 14, color: isLight ? '#64748B' : colors.textSecondary, marginTop: 4 },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: isLight ? '#F8FAFC' : colors.iconBg, justifyContent: 'center', alignItems: 'center' },
  
  receiptSection: { backgroundColor: isLight ? '#F8FAFC' : colors.background, borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  sectionTitle: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  receiptLabel: { fontFamily: 'Inter_18pt-Regular', fontSize: 14, color: isLight ? '#475569' : colors.textSecondary },
  receiptValue: { fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary },
  receiptValueRed: { fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: isLight ? '#EF4444' : '#F87171' },
  receiptDivider: { height: 1, backgroundColor: isLight ? '#E2E8F0' : colors.border, marginVertical: 14 },
  receiptLabelPremium: { fontFamily: 'Inter_18pt-Medium', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary },
  receiptValuePremium: { fontFamily: 'Inter_18pt-Medium', fontSize: 16, color: isLight ? '#0F172A' : colors.textPrimary },
  
  netPayHighlight: { backgroundColor: isLight ? '#0F172A' : colors.iconBg, borderRadius: 24, padding: 24, alignItems: 'center', marginTop: 8, marginBottom: 16 },
  netPayHighlightLabel: { fontFamily: 'Inter_18pt-Regular', fontSize: 13, color: isLight ? '#94A3B8' : colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, includeFontPadding: false },
  netPayHighlightValue: { fontFamily: 'Inter_18pt-Medium', fontSize: 36, color: isLight ? '#FFFFFF' : colors.textPrimary, letterSpacing: -1, includeFontPadding: false, lineHeight: 40 },
});
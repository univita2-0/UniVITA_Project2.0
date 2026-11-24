import React, { useState, useContext, useMemo } from 'react';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  LayoutAnimation, Platform, UIManager 
} from 'react-native';

import { ChevronDown, ChevronUp, HelpCircle, FileText, Info } from 'lucide-react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const HELP_DATA = [
  {
    category: "Attendance & Clocking",
    items: [
      {
        question: "How to Clock In for a Shift",
        steps: [
          "Ensure your phone's GPS/Location is turned ON and set to 'High Accuracy'.",
          "Ensure you are connected to the internet (Wi-Fi or Mobile Data).",
          "Open the UniVITA app and go to the Home tab.",
          "Check if your scheduled shift for today appears on the screen.",
          "Tap the 'Clock In' button. You may be asked to allow Camera and Location permissions if this is your first time.",
          "Take a clear selfie. Make sure your face is visible and well-lit.",
          "The app will verify your GPS location. If you are inside the campus geofence, you will see a 'Success' message."
        ],
        note: "Clock-in requires an eligible assigned shift, GPS verification and a selfie. The allowed attendance window is determined by the current system policy."
      },
      {
        question: "How to Clock Out",
        steps: [
          "Go to the Home tab and locate your active shift.",
          "Tap the 'Clock Out' button.",
          "Take a selfie for verification.",
          "Ensure your GPS is active. The app will verify you are still on campus.",
          "Wait for the 'Clocked out successfully' message."
        ],
        note: "Clock-out is restricted to the allowed window near shift end. If you need to leave early, use the attendance correction/request workflow."
      }
    ]
  },
  {
    category: "Filing Requests",
    items: [
      {
        question: "How to File a Leave Request",
        steps: [
          "Open Requests from the Home screen's Quick Modules or another available Requests shortcut.",
          "Tap 'File Leave'.",
          "Select the Leave Type (e.g., Sick, Vacation, Emergency).",
          "Select the Date(s) of your leave.",
          "Choose the Duration (Whole Day, 1st Half, 2nd Half).",
          "Type a detailed Reason (minimum 10 characters).",
          "Attach a supporting document (e.g., Medical Certificate for Sick Leave).",
          "Tap 'Submit'. HR will review your request."
        ],
        note: "You cannot file retroactive leaves (backdated) unless it is an Emergency or Sick leave. Leave balance must be sufficient."
      },
      {
        question: "How to File Overtime (OT)",
        steps: [
          "Open Requests from Home or the available Requests shortcut.",
          "Tap 'File Overtime'.",
          "Select the Date and the specific assigned shift if more than one exists.",
          "Select the OT Timing (Early OT or Normal OT).",
          "Set the Start Time and End Time of your overtime.",
          "Type a detailed reason for the OT.",
          "Attach supporting proof (required for all overtime requests).",
          "Tap 'Submit'."
        ],
        note: "Overtime must be at least 30 minutes. If you select CTO (Compensatory Time Off), it must be at least 1 hour."
      },
      {
        question: "How to Fix a Missed Clock-In/Out (Correction)",
        steps: [
          "Open Requests from Home or the available Requests shortcut.",
          "Tap 'File Correction'.",
          "Select the affected date and assigned shift if multiple shifts exist.",
          "Select whether you are correcting a Clock-In, Clock-Out, or Early-Out.",
          "Enter the exact time you actually arrived or left.",
          "Type a reason explaining why you missed it.",
          "Attach a photo or document as proof.",
          "Tap 'Submit'. HR will review and approve it."
        ],
        note: "Corrections can only be filed for the last 30 days."
      },
      {
        question: "How to File an Attendance Appeal",
        steps: [
          "Open Requests from Home or the available Requests shortcut.",
          "Tap 'Attendance Appeal'.",
          "Select the affected date and assigned shift if multiple shifts exist.",
          "Enter your actual Clock-In and Clock-Out times.",
          "Provide a detailed reason explaining why you are appealing (minimum 10 characters).",
          "You MUST attach a supporting document (Image, PDF, or DOC) as proof.",
          "Tap 'Submit'. HR will review your appeal."
        ],
        note: "Appeals are only allowed for the last 30 days and strictly require a supporting file attachment. If approved, your attendance will be updated to 'Completed'."
      }
    ]
  },
  {
    category: "Troubleshooting",
    items: [
      {
        question: "My GPS says 'Outside Campus' but I am inside.",
        steps: [
          "Step outside or move closer to a window to get a better satellite signal.",
          "Turn your phone's Wi-Fi off and on to refresh the location sensors.",
          "Ensure you are not in a basement or highly enclosed room.",
          "Restart your phone's GPS/Location toggle."
        ],
        note: "The app uses a strict geofence. If your phone has a weak GPS signal, it might miscalculate your distance."
      },
      {
        question: "I am not receiving Emergency Alerts or Chat messages.",
        steps: [
          "Go to your phone's Settings > Apps > UniVITA.",
          "Check that 'Notifications' are allowed.",
          "Check that 'Battery Optimization' is turned off for UniVITA (so Android doesn't kill the app in the background)."
        ],
        note: "If you are using a VPN, it may block our Push Notification servers."
      }
    ]
  }
];

export default function HelpAndTermsScreen() {
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState('help');

  const toggleExpand = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    // 👈 Changed from <SafeAreaView> to <View>
    <View style={styles.safeArea}>
      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'help' && styles.tabButtonActive]}
          onPress={() => setActiveTab('help')}
        >
          <HelpCircle size={18} color={activeTab === 'help' ? '#0D9488' : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'help' && styles.tabTextActive]}>Help Center</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'terms' && styles.tabButtonActive]}
          onPress={() => setActiveTab('terms')}
        >
          <FileText size={18} color={activeTab === 'terms' ? '#0D9488' : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'terms' && styles.tabTextActive]}>Terms & Privacy</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'help' ? (
          <View>
            {HELP_DATA.map((category, catIndex) => (
              <View key={catIndex} style={styles.categoryContainer}>
                <Text style={styles.categoryTitle}>{category.category}</Text>
                
                {category.items.map((item, itemIndex) => {
                  const uniqueId = `${catIndex}-${itemIndex}`;
                  const isExpanded = expandedId === uniqueId;

                  return (
                    <View key={uniqueId} style={styles.faqCard}>
                      <TouchableOpacity 
                        style={styles.faqHeader} 
                        onPress={() => toggleExpand(uniqueId)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.faqQuestion}>{item.question}</Text>
                        {isExpanded ? 
                          <ChevronUp size={20} color="#0D9488" /> : 
                          <ChevronDown size={20} color={colors.textSecondary} />
                        }
                      </TouchableOpacity>
                      
                      {isExpanded && (
                        <View style={styles.faqBody}>
                          {item.steps.map((step, sIndex) => (
                            <View key={sIndex} style={styles.stepRow}>
                              <View style={styles.stepNumberCircle}>
                                <Text style={styles.stepNumberText}>{sIndex + 1}</Text>
                              </View>
                              <Text style={styles.stepText}>{step}</Text>
                            </View>
                          ))}
                          
                          {item.note && (
                            <View style={styles.noteBox}>
                              <Info size={16} color="#FBBF24" style={{ marginTop: 2 }} />
                              <Text style={styles.noteText}>{item.note}</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        ) : (
          <View>
            <Text style={styles.sectionTitle}>Terms and Conditions</Text>
            <Text style={styles.paragraph}>
              App guidance for UniVITA users{'\n\n'}
              Welcome to UniVITA. By using this application, you agree to these terms. 
              This app is strictly for authorized instructors and staff of HCT Academy.
            </Text>

            <Text style={styles.subHeading}>1. Data Privacy (RA 10173)</Text>
            <Text style={styles.paragraph}>
              We collect your location data and selfies strictly for attendance verification and geofencing purposes during your scheduled shifts. 
              Location and selfie information are sensitive personal data. For official collection, retention, sharing and privacy practices, consult HCT Academy’s approved privacy notice.
            </Text>

            <Text style={styles.subHeading}>2. Location Tracking</Text>
            <Text style={styles.paragraph}>
              UniVITA uses device location to support scheduled-shift attendance and location verification, subject to device permissions and institutional policy. Check the device location indicator and contact HR if tracking appears active unexpectedly.
            </Text>

            <Text style={styles.subHeading}>3. Account Security</Text>
            <Text style={styles.paragraph}>
              You are responsible for maintaining the confidentiality of your login credentials and OTP codes. Any actions taken under your account are your responsibility.
            </Text>

            <Text style={styles.subHeading}>4. Contact Us</Text>
            <Text style={styles.paragraph}>
              For technical support, corrections to personal records, or privacy concerns, contact your designated HCT Academy HR or system administrator.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
    // 👈 Changed closing tag from </SafeAreaView> to </View>
  );
}

const makeStyles = (colors, isDark) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: isDark ? colors.background : '#F8FAFC' },
  tabContainer: { 
    flexDirection: 'row', 
    paddingHorizontal: 16, 
    paddingTop: 16, 
    paddingBottom: 8, // 👈 Adjusted for better spacing below tabs
    gap: 12 
  },
  tabButton: { 
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', 
    gap: 8, paddingVertical: 12, borderRadius: 10, backgroundColor: isDark ? colors.surface : '#FFFFFF', 
    borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0' 
  },
  tabButtonActive: { backgroundColor: isDark ? 'rgba(13,148,136,0.16)' : '#F0FDFA', borderColor: '#0D9488' },
  tabText: { fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: '#64748B' },
  tabTextActive: { color: '#0D9488', fontFamily: 'Inter_18pt-Bold' },
  
  scrollContent: { 
    paddingHorizontal: 16, 
    paddingTop: 8, 
    paddingBottom: 52 // Keep the last FAQ/terms item fully scrollable
  },
  
  categoryContainer: { marginBottom: 24 },
  categoryTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: '#0D9488', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  
  faqCard: { backgroundColor: isDark ? colors.surface : '#FFFFFF', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0', overflow: 'hidden' },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  faqQuestion: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: isDark ? '#FFFFFF' : '#0F172A', flex: 1, paddingRight: 10 },
  faqBody: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: isDark ? colors.border : '#E2E8F0', paddingTop: 12 },
  
  stepRow: { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-start' },
  stepNumberCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: isDark ? colors.iconBg : '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 1 },
  stepNumberText: { fontFamily: 'Inter_18pt-Bold', fontSize: 12, color: '#0D9488' },
  stepText: { fontFamily: 'Inter_18pt-Regular', fontSize: 14, color: isDark ? '#CBD5E1' : '#475569', lineHeight: 20, flex: 1 },

  noteBox: { flexDirection: 'row', backgroundColor: 'rgba(251, 191, 36, 0.1)', padding: 12, borderRadius: 8, marginTop: 8, gap: 8, borderWidth: 1, borderColor: 'rgba(251, 191, 36, 0.2)' },
  noteText: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isDark ? '#FBBF24' : '#92400E', lineHeight: 18, flex: 1 },

  sectionTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 20, color: isDark ? '#FFFFFF' : '#0F172A', marginBottom: 16 },
  subHeading: { fontFamily: 'Inter_18pt-Bold', fontSize: 16, color: isDark ? '#FFFFFF' : '#0F172A', marginTop: 20, marginBottom: 8 },
  paragraph: { fontFamily: 'Inter_18pt-Regular', fontSize: 14, color: isDark ? '#94A3B8' : '#475569', lineHeight: 22, marginBottom: 12 },
});
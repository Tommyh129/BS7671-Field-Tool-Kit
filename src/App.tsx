import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap,
  Ruler,
  Settings2,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Info,
  Calculator,
  ArrowLeft,
  Activity,
  LayoutGrid,
  Cpu,
  Waves,
  Search,
  TrendingDown,
  Menu,
  Maximize,
  X,
  Share2,
  Download,
  Copy,
  Check,
  Crown,
  Lock,
  Star,
  LogOut,
  LogIn,
  User as UserIcon,
  FileText,
  History as HistoryIcon,
  Mail,
  Eye,
  EyeOff,
  Star as StarIcon,
  Shield,
  Gauge,
  BatteryCharging,
  Cable,
  Globe,
  FolderOpen
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { downloadFile } from './utils/download';
import { secureLegalUrl, PRIVACY_NOTICE_VERSION, PUBLISHED_PRIVACY_POLICY_URL, PUBLISHED_TERMS_URL } from './privacy/config';
import { allowSandboxBusiness } from './privacy/sandbox';
import { clearBusinessDeviceData, readBusiness } from './business/store';
import { clearInvoiceDeviceData, pendingAction } from './business/invoices/client';
import { clearRamsDeviceData, hasPendingRams } from './business/rams/client';
import { SupplyType, InstallationMethod, CalculationResult, CircuitType, AppMode, CableCoreType, CableType, SupplySystem, DeviceType, CalculationHistory } from './types';
import { calculateCircuit, getCircuitInputIssue, CircuitOptions } from './utils/calculations';
import { getCableRows, getCombinationIssue, getInstallationIssue, INSTALLATION_ENTRIES, getSourceIdsForTool, formatSourceNotes } from './data/electrical';
import CableDesignControls from './components/CableDesignControls';
import RecalculateButton from './components/RecalculateButton';
import SourceNotes from './components/SourceNotes';
import ZsCalculator from './components/ZsCalculator';
import FaultCurrentCalculator from './components/FaultCurrentCalculator';
import CableResistanceCalculator from './components/CableResistanceCalculator';
import MaxLengthCalculator from './components/MaxLengthCalculator';
import EarthElectrodeCalculator from './components/EarthElectrodeCalculator';
import ThreePhaseCalculator from './components/ThreePhaseCalculator';
import ThreePhaseMotorCalculator from './components/ThreePhaseMotorCalculator';
import SmartCircuitDesigner from './components/SmartCircuitDesigner';
import ProtectiveDeviceSelector from './components/ProtectiveDeviceSelector';
import DcVoltageDropCalculator from './components/DcVoltageDropCalculator';
import History from './components/History';
import { ProjectsWorkspace } from './business/Projects';
import HomeSummary from './components/HomeSummary';
import { recordToolUse, TOOL_MODES, backDestination } from './services/homeSummary';
import { SaveToProject } from './business/SaveToProject';
import { BusinessArchive } from './business/BusinessArchive';
import { blobDataUrl } from './business/pdf';
import { STORE_ONLY_PURCHASE_MESSAGE, hasBusinessAccess, strongestStoreTier, storeTier, subscriptionApiUrl, validateBusinessStorePrice, planReplacement, androidReplacementToken, assertAppleSubscriptionGroup, type BusinessAccess, type SubscriptionTier } from './subscriptions';
import { CalculatorDocument } from './business/CalculatorDocument';
import ModalSheet from './components/ModalSheet';
import { checkRegulatoryUpdates, DEFAULT_REGULATORY_UPDATE, REGULATORY_CACHE_VERSION, RegulatoryUpdate } from './services/geminiService';
import { getApiUrl } from './services/api';
import { saveCalculation, clearLocalHistory, getHistory } from './services/historyService';
import { auth, db } from './firebase';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser as CapacitorBrowser } from '@capacitor/browser';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { InAppPurchase } from 'capacitor-plugin-purchase';
import { Share as NativeShare } from '@capacitor/share';
import {
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithCredential,
  updateProfile
} from 'firebase/auth';
import type { AuthCredential } from 'firebase/auth';
import {
  doc,
  onSnapshot,
  setDoc,
  getDoc,
  getDocFromServer,
  updateDoc
} from 'firebase/firestore';

// --- Types ---
interface UserProfile extends BusinessAccess {
  uid: string;
  email: string;
  isPro: boolean;
  displayName?: string;
  photoURL?: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(_error: unknown, operationType: OperationType, _path: string | null) {
  console.error('Firestore operation failed:', operationType);
  throw new Error('Cloud access failed. Check your connection and account permissions.');
}

// --- Constants ---
const PUBLIC_APP_URL = 'https://the-sparkys-mate-29962838005.europe-west1.run.app';
const PRIVACY_POLICY_URL = secureLegalUrl(import.meta.env.VITE_PRIVACY_POLICY_URL, PUBLISHED_PRIVACY_POLICY_URL);
const TERMS_OF_SERVICE_URL = secureLegalUrl(import.meta.env.VITE_TERMS_URL, PUBLISHED_TERMS_URL);
const PRIVACY_REQUEST_URL = secureLegalUrl(import.meta.env.VITE_PRIVACY_REQUEST_URL, '');
const DATA_PROCESSING_TERMS_URL = secureLegalUrl(import.meta.env.VITE_DATA_PROCESSING_TERMS_URL, '');
const privacyEmail = import.meta.env.VITE_PRIVACY_CONTACT_EMAIL || 'tommyholm@hotmail.co.uk';
const PRIVACY_CONTACT_EMAIL = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(privacyEmail) ? privacyEmail : 'tommyholm@hotmail.co.uk';
const PRIVACY_CONTACT_URL = `mailto:${PRIVACY_CONTACT_EMAIL}?subject=Privacy%20request%20or%20complaint`;
const SUPPORT_URL = `${PUBLIC_APP_URL}?page=support`;
const SUPPORT_EMAIL = 'mailto:tommyholm@hotmail.co.uk';
const DEFAULT_PRO_PRODUCT_ID = 'pro_subscription';
const PRO_PRODUCT_TYPE = 'subscription';
const ANDROID_BILLING_DIAGNOSTICS_ENABLED = import.meta.env.VITE_ANDROID_BILLING_DIAGNOSTICS === 'true';
type StorePurchaseLike = { productId?: string | null };
type HistorySaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type BillingDiagnosticSnapshot = {
  allowed: boolean;
  billingClientInitialized: boolean;
  billingClientReady: boolean;
  billingConnected: boolean;
  lastStage: string;
  failedCheck: string;
  responseCode: number | null;
  debugMessage: string;
  productDetailsReturned: boolean;
  eligibleOfferReturned: boolean;
  eligibleOfferCount: number;
  selectedBasePlanId: string;
  selectedOfferId: string;
  requestedProductIds: string[];
  returnedProductIds: string[];
};
type BillingDiagnosticsBridge = {
  getBillingDiagnostics: () => Promise<BillingDiagnosticSnapshot>;
};
type HistorySavePayload = {
  type: CalculationHistory['type'];
  title: string;
  inputs: Record<string, unknown>;
  results: Record<string, unknown>;
};

const envValue = (key: string) => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.[key]?.trim();
};

const sanitizeBillingDiagnosticText = (value: unknown) => String(value ?? '')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
  .replace(/\b(purchaseToken|token|orderId|accountId|email)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
  .slice(0, 500);

const sanitizeBillingProductIds = (value: unknown) => Array.isArray(value)
  ? value.map(item => sanitizeBillingDiagnosticText(item).slice(0, 160)).filter(Boolean).slice(0, 20)
  : [];

const sanitizeBillingDiagnosticSnapshot = (snapshot: BillingDiagnosticSnapshot): BillingDiagnosticSnapshot => ({
  allowed: Boolean(snapshot.allowed),
  billingClientInitialized: Boolean(snapshot.billingClientInitialized),
  billingClientReady: Boolean(snapshot.billingClientReady),
  billingConnected: Boolean(snapshot.billingConnected),
  lastStage: sanitizeBillingDiagnosticText(snapshot.lastStage) || 'unknown',
  failedCheck: sanitizeBillingDiagnosticText(snapshot.failedCheck) || 'unknown',
  responseCode: Number.isInteger(snapshot.responseCode) ? snapshot.responseCode : null,
  debugMessage: sanitizeBillingDiagnosticText(snapshot.debugMessage) || 'No debug message supplied by Google Play.',
  productDetailsReturned: Boolean(snapshot.productDetailsReturned),
  eligibleOfferReturned: Boolean(snapshot.eligibleOfferReturned),
  eligibleOfferCount: Number.isFinite(snapshot.eligibleOfferCount) ? snapshot.eligibleOfferCount : 0,
  selectedBasePlanId: sanitizeBillingDiagnosticText(snapshot.selectedBasePlanId) || 'none',
  selectedOfferId: sanitizeBillingDiagnosticText(snapshot.selectedOfferId) || 'none',
  requestedProductIds: sanitizeBillingProductIds(snapshot.requestedProductIds),
  returnedProductIds: sanitizeBillingProductIds(snapshot.returnedProductIds)
});

const productIdList = (...values: Array<string | undefined>) => {
  const ids = values
    .flatMap(value => (value || '').split(','))
    .map(value => value.trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
};

const nativeProProductIds = () => {
  const platform = Capacitor.getPlatform();

  if (platform === 'ios') {
    return productIdList(envValue('VITE_IOS_PRO_PRODUCT_ID') || DEFAULT_PRO_PRODUCT_ID);
  }

  if (platform === 'android') {
    const androidProductId =
      envValue('VITE_ANDROID_PRO_PRODUCT_ID') ||
      envValue('VITE_PRO_PRODUCT_ID') ||
      DEFAULT_PRO_PRODUCT_ID;

    return productIdList(
      androidProductId,
      envValue('VITE_PRO_PRODUCT_ID_ALIASES')
    );
  }

  return productIdList(envValue('VITE_PRO_PRODUCT_ID') || DEFAULT_PRO_PRODUCT_ID);
};

const nativeBusinessProductIds = () => productIdList(
  envValue(Capacitor.getPlatform() === 'ios' ? 'VITE_IOS_BUSINESS_PRODUCT_ID' : 'VITE_ANDROID_BUSINESS_PRODUCT_ID') ||
  envValue('VITE_BUSINESS_PRODUCT_ID') || 'business_subscription'
);
const nativeProductIds = (tier: SubscriptionTier) => tier === 'business' ? nativeBusinessProductIds() : nativeProProductIds();
const purchaseTier = (purchases: StorePurchaseLike[]) => strongestStoreTier(purchases, nativeProProductIds(), nativeBusinessProductIds());
const billingApiUrl = (path: string) => subscriptionApiUrl(path, Capacitor.isNativePlatform(), getApiUrl);

const productIdLabel = (productIds: string[]) => productIds.map(id => `"${id}"`).join(', ');

const nativeProDeviceStorageKey = 'bs7671_native_pro_device';
const nativeProStorageKey = (uid: string) => `bs7671_native_pro_${uid}`;
const hasStoredNativeProAccess = (uid?: string | null) => {
  if (localStorage.getItem(nativeProDeviceStorageKey) === 'true') {
    return true;
  }

  return Boolean(uid && localStorage.getItem(nativeProStorageKey(uid)) === 'true');
};
const nativePurchaseUserOptions = (uid?: string | null) => {
  // StoreKit appAccountToken must be a UUID. Firebase UIDs are not UUIDs, so
  // filtering iOS restores by Firebase UID can hide valid Apple subscriptions.
  if (Capacitor.getPlatform() === 'ios' || !uid) {
    return {};
  }

  return { userId: uid };
};

const productUnavailableMessage = (productIds: string[]) => {
  if (Capacitor.getPlatform() === 'ios') {
    return `Apple StoreKit did not return the configured subscription product (${productIdLabel(productIds)}). Reinstall the latest TestFlight build and check the App ID/provisioning profile has In-App Purchase enabled for com.bs7671.fieldtoolkit. If you already subscribed, use Restore Purchases.`;
  }

  return `Google Play did not return any configured subscription product (${productIdLabel(productIds)}). Check the product ID, package name, signing key, active base plan, and closed testing availability. If you already subscribed, use Restore Purchases.`;
};

const authErrorCode = (error: unknown) => {
  if (!error || typeof error !== 'object') return '';
  const code = 'code' in error ? String(error.code) : '';
  if (code.startsWith('auth/')) return code;

  const message = 'message' in error ? String(error.message) : '';
  const match = message.match(/auth\/[a-z-]+/i);
  return match?.[0]?.toLowerCase() || '';
};

const friendlyAuthError = (error: unknown, action: 'sign-in' | 'sign-up' | 'delete' = 'sign-in') => {
  const code = authErrorCode(error);

  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account already exists for this email address. Sign in instead.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Choose a stronger password with at least six characters.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return action === 'delete'
        ? 'Verification failed. Check your password or sign-in account and try again.'
        : 'The email address or password is incorrect.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support for assistance.';
    case 'auth/network-request-failed':
      return 'A network error occurred. Check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts were made. Wait a few minutes and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'This email uses a different sign-in method. Try the provider originally used.';
    case 'auth/credential-already-in-use':
      return 'This sign-in account is already connected to another user.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is temporarily unavailable. Contact support.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/requires-recent-login':
      return 'For security, verify your identity again before deleting the account.';
    case 'auth/unauthorized-domain': {
      const currentHost = typeof window !== 'undefined' ? window.location.host : '';
      return `Domain "${currentHost || 'unauthorized-domain'}" is not authorized. Since the app is in the AI Studio preview iframe, please:
1. Open the app in a new browser tab using your Development App URL or Shared App URL where login works directly.
2. Or, add "ai.studio.google.com" and "aistudio.google.com" (the parent iframe domains) to your Firebase Console > Authentication > Settings > Authorized domains.`;
    }
    default:
      return action === 'sign-up'
        ? 'The account could not be created. Check the details and try again.'
        : action === 'delete'
          ? 'Your identity could not be verified. Please try again.'
          : 'Sign-in failed. Check your details and try again.';
  }
};

const openExternalUrl = async (url: string) => {
  if (url.startsWith('mailto:')) {
    window.location.href = url;
    return;
  }
  if (Capacitor.isNativePlatform()) {
    await CapacitorBrowser.open({ url });
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
};

const HeaderLogoMark = () => (
  <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-emerald-500 shadow-lg shadow-emerald-500/20 shrink-0 relative" aria-hidden="true">
    <span className="absolute inset-0 flex items-center justify-center text-black/25 text-[9px] font-black tracking-tighter">
      BS
    </span>
    <svg viewBox="0 0 1024 1024" className="relative z-10 w-full h-full" focusable="false">
      <rect width="1024" height="1024" fill="#10B981" />
      <path d="M592.5 80L250 540H480L431.5 944L774 484H544L592.5 80Z" fill="white" />
    </svg>
  </div>
);

export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);

  // --- Auth & Profile State ---
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [hasNativeProPurchase, setHasNativeProPurchase] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [resumeUpgradeAfterAuth, setResumeUpgradeAfterAuth] = useState(false);
  const [showPostPurchaseAccountPrompt, setShowPostPurchaseAccountPrompt] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const isAutoPro = (_email: string) => allowSandboxBusiness({
    dev:import.meta.env.DEV, enabled:import.meta.env.VITE_SANDBOX_BUSINESS_ACCESS==='true',
    native:Capacitor.isNativePlatform(), hostname:window.location.hostname,
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [regulatoryInfo, setRegulatoryInfo] = useState<RegulatoryUpdate>(DEFAULT_REGULATORY_UPDATE);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [regulatoryCheckMessage, setRegulatoryCheckMessage] = useState<string | null>(null);
  const [homeProjectId, setHomeProjectId] = useState('');
  const [hasApiKey, setHasApiKey] = useState(true);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  // Handle URL parameters for public legal/support routes.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    if (page === 'privacy') {
      setMode(AppMode.PRIVACY);
    } else if (page === 'terms') {
      setMode(AppMode.TERMS);
    } else if (page === 'delete-account') {
      setMode(AppMode.ACCOUNT_DELETION);
    } else if (page === 'support') {
      setMode(AppMode.SUPPORT);
    }
  }, []);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        try {
          const selected = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(selected);
        } catch (e) {
          console.warn("API Key check failed:", e);
        }
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const setNativeProAccess = (uid: string | null | undefined, hasAccess: boolean) => {
    setHasNativeProPurchase(hasAccess);
    if (hasAccess) {
      localStorage.setItem(nativeProDeviceStorageKey, 'true');
      if (uid) {
        localStorage.setItem(nativeProStorageKey(uid), 'true');
      }
    } else {
      localStorage.removeItem(nativeProDeviceStorageKey);
      if (uid) {
        localStorage.removeItem(nativeProStorageKey(uid));
      }
    }
  };

  const [upgradeTier, setUpgradeTier] = useState<SubscriptionTier>('pro');
  const purchaseAttempt = useRef(false);
  const [nativeBusinessUntil, setNativeBusinessUntil] = useState(0);
  const [entitlementNow, setEntitlementNow] = useState(Date.now());
  const sandboxBusiness = allowSandboxBusiness({
    dev: import.meta.env.DEV,
    enabled: import.meta.env.VITE_SANDBOX_BUSINESS_ACCESS === 'true',
    native: Capacitor.isNativePlatform(),
    hostname: window.location.hostname,
  });
  const effectiveIsBusiness = sandboxBusiness || hasBusinessAccess(user?.uid === profile?.uid ? profile : null, entitlementNow) || nativeBusinessUntil > entitlementNow;
  useEffect(() => {
    const tick = () => setEntitlementNow(Date.now());
    const timer = window.setInterval(tick, 15000);
    window.addEventListener('focus', tick);
    return () => {clearInterval(timer);window.removeEventListener('focus', tick);};
  }, []);
  const openUpgrade = (tier: SubscriptionTier = 'pro') => {
    setUpgradeTier(tier);setShowUpgradeModal(true);
  };

  const effectiveIsPro = useMemo(() => {
    // Force Pro for specific testing accounts if needed
    if (user && isAutoPro(user.email || "")) return true;
    return isPro || hasNativeProPurchase || effectiveIsBusiness;
  }, [isPro, hasNativeProPurchase, user, effectiveIsBusiness]);

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showBillingDiagnostics, setShowBillingDiagnostics] = useState(false);
  const [billingDiagnostics, setBillingDiagnostics] = useState<BillingDiagnosticSnapshot | null>(null);
  const [billingDiagnosticsContext, setBillingDiagnosticsContext] = useState('Not checked yet');
  const [billingDiagnosticsCopyStatus, setBillingDiagnosticsCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [cleanMode, setCleanMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [privacyMessage, setPrivacyMessage] = useState('');

  // Shared States
  const [loadKw, setLoadKw] = useState<string>('');
  const [lengthM, setLengthM] = useState<string>('');
  const [supplyType, setSupplyType] = useState<SupplyType>(SupplyType.SINGLE_PHASE);
  const [cableCoreType, setCableCoreType] = useState<CableCoreType>(CableCoreType.MULTI_CORE);
  const [cableType, setCableType] = useState<CableType>(CableType.PVC_PVC);
  const [method, setMethod] = useState<InstallationMethod>(InstallationMethod.METHOD_C);
  const [cableOptions, setCableOptions] = useState<CircuitOptions>({ operatingTemperature: 70, cpcArrangement: 'separate', autoSizeSeparateCpc: true });
  useEffect(() => { if (getInstallationIssue(cableType, method)) setMethod(InstallationMethod.METHOD_C); }, [cableType, method]);
  const [circuitType, setCircuitType] = useState<CircuitType>(CircuitType.OTHER);
  const [ze, setZe] = useState<string>('0.35');
  const [deviceType, setDeviceType] = useState<DeviceType>(DeviceType.MCB_B);
  const [showResults, setShowResults] = useState(false);
  const [targetCurrent, setTargetCurrent] = useState<string>('');
  const [showMethodInfo, setShowMethodInfo] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showTextShareMenu, setShowTextShareMenu] = useState(false);
  const [sharedText, setSharedText] = useState('');
  const [isCopying, setIsCopying] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [isSavingPDF, setIsSavingPDF] = useState(false);
  const [isSavingTextPDF, setIsSavingTextPDF] = useState(false);
  const [historySaveStatus, setHistorySaveStatus] = useState<HistorySaveStatus>('idle');
  const shareRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const lastSavedHistoryRef = useRef<string | null>(null);
  const regulatoryCheckInFlightRef = useRef(false);
  const historySaveResetRef = useRef<number | null>(null);
  const isSavingHistory = historySaveStatus === 'saving';

  const applyRegulatoryUpdates = useCallback((updates: RegulatoryUpdate) => {
    setRegulatoryInfo(updates);
    localStorage.setItem('bs7671_regulatory_info', JSON.stringify(updates));
    localStorage.setItem('bs7671_cache_time', Date.now().toString());
    localStorage.setItem('bs7671_cache_version', REGULATORY_CACHE_VERSION);
  }, []);

  const loadCachedRegulatoryInfo = useCallback(() => {
    const cached = localStorage.getItem('bs7671_regulatory_info');
    const cacheTime = localStorage.getItem('bs7671_cache_time');
    const cacheVersion = localStorage.getItem('bs7671_cache_version');
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    if (!cached || !cacheTime || cacheVersion !== REGULATORY_CACHE_VERSION) {
      return false;
    }

    if ((now - parseInt(cacheTime, 10)) >= oneDay) {
      return false;
    }

    try {
      setRegulatoryInfo(JSON.parse(cached));
      return true;
    } catch (error) {
      console.warn("Cached regulatory update was invalid, refreshing.", error);
      return false;
    }
  }, []);

  const refreshRegulatoryInfo = useCallback(async ({ force = false, silent = false } = {}) => {
    if (regulatoryCheckInFlightRef.current) {
      return;
    }

    regulatoryCheckInFlightRef.current = true;
    setIsCheckingUpdates(true);
    if (!silent) {
      setRegulatoryCheckMessage(null);
    }

    try {
      const updates = await checkRegulatoryUpdates({
        force,
        throwOnError: force,
      });
      applyRegulatoryUpdates(updates);
      if (!silent) {
        const checkedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setRegulatoryCheckMessage(`Checked ${checkedAt}: using ${updates.version} ${updates.amendment}.`);
      }
    } catch (error: any) {
      console.error("Failed to fetch regulatory updates:", error);
      if (error?.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
      }
      if (!silent) {
        setRegulatoryCheckMessage('Could not contact the update service. Saved BS 7671 data is still being used.');
      }
    } finally {
      regulatoryCheckInFlightRef.current = false;
      setIsCheckingUpdates(false);
    }
  }, [applyRegulatoryUpdates]);

  // --- Regulatory Logic ---
  useEffect(() => {
    const refreshIfNeeded = () => {
      if (!loadCachedRegulatoryInfo()) {
        refreshRegulatoryInfo({ silent: true });
      }
    };

    refreshIfNeeded();

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshIfNeeded();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    let isMounted = true;
    let removeAppStateListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          refreshIfNeeded();
        }
      }).then(handle => {
        if (isMounted) {
          removeAppStateListener = () => handle.remove();
        } else {
          handle.remove();
        }
      });
    }

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      removeAppStateListener?.();
    };
  }, [loadCachedRegulatoryInfo, refreshRegulatoryInfo]);

  // --- Core Type Logic ---
  // We keep the state but remove the restrictive filtering and auto-switching
  // to ensure all methods are available as requested.

  const allMethods = INSTALLATION_ENTRIES;

  // --- Auth & IAP Logic ---
  useEffect(() => {
    console.log("App: Initializing Auth & IAP...");

    // Initialize Native IAP if on mobile
    if (Capacitor.isNativePlatform()) {
      try {
        console.log("App: Native platform detected");
      } catch (error) {
        console.error("App: Native check error", error);
      }
    }

    let unsubProfile: (() => void) | null = null;

    // Check for Stripe success redirect
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
      setIsSyncing(true);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Give it a few seconds to sync from webhook
      setTimeout(() => setIsSyncing(false), 5000);
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const email = firebaseUser?.email?.toLowerCase().trim() || "";
      const hasLocalNativePro = hasStoredNativeProAccess(firebaseUser?.uid);
      console.log("App: Authentication state changed.");
      setUser(firebaseUser);
      setHasNativeProPurchase(hasLocalNativePro);

      // Auto-grant Pro to the admin/test emails for testing/demo
      const isAuto = isAutoPro(email);
      if (isAuto || hasLocalNativePro) {
        console.log("App: Auto-Pro detected, forcing Pro status locally.");
        setIsPro(true);
      }

      // Always clear previous profile listener on auth change
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (!userDoc.exists()) {
            console.log("App: Creating new user profile...");
            await setDoc(userDocRef, {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              isPro: false, // Permanent account entitlements are written by the verified backend/admin only.
              displayName: firebaseUser.displayName || '',
              photoURL: firebaseUser.photoURL || '',
              createdAt: new Date().toISOString()
            });
          }

          unsubProfile = onSnapshot(userDocRef, (doc) => {
            if (doc.exists()) {
              const data = doc.data() as UserProfile;
              const proStatus = data.isPro || isAuto || hasStoredNativeProAccess(firebaseUser.uid);
              console.log("App: Profile refreshed.");
              setProfile(data);
              setIsPro(proStatus);
            }
            setIsAuthLoading(false);
            setIsSyncing(false);
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
            setIsAuthLoading(false);
          });
        } catch (error) {
          console.error("App: Auth sync error:", error);
          setIsAuthLoading(false);
        }
      } else {
        setProfile(null);
        setIsPro(false);
        setHasNativeProPurchase(hasStoredNativeProAccess());
        setIsAuthLoading(false);
      }
    }, (error) => {
      console.error("App: Auth listener error:", error);
      setIsAuthLoading(false);
    });

    const timeout = setTimeout(() => {
      setIsAuthLoading(prev => {
        if (prev) console.warn("App: Auth loading timed out after 5s - forcing UI");
        return false;
      });
    }, 5000);

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
      clearTimeout(timeout);
    };
  }, []);

  // Test Firestore Connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  const getNativeSocialCredential = async (providerType: 'google' | 'apple'): Promise<AuthCredential> => {
    const result = providerType === 'google'
      ? await FirebaseAuthentication.signInWithGoogle({
          skipNativeAuth: true,
          useCredentialManager: false
        })
      : await FirebaseAuthentication.signInWithApple({
          skipNativeAuth: true,
          scopes: ['email', 'name']
        });

    const nativeCredential = result.credential;

    if (providerType === 'google') {
      if (!nativeCredential?.idToken && !nativeCredential?.accessToken) {
        throw new Error("Google sign-in did not return an auth token.");
      }

      const credential = GoogleAuthProvider.credential(
        nativeCredential?.idToken || null,
        nativeCredential?.accessToken || undefined
      );
      return credential;
    }

    if (!nativeCredential?.idToken) {
      throw new Error("Apple sign-in did not return an ID token.");
    }

    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({
      idToken: nativeCredential.idToken,
      rawNonce: nativeCredential.nonce
    });
    return credential;
  };

  const handleNativeSocialLogin = async (providerType: 'google' | 'apple') => {
    const credential = await getNativeSocialCredential(providerType);
    await signInWithCredential(auth, credential);
  };

  const openAuthModal = (signUp: boolean, resumeUpgrade = false) => {
    setLoginError(null);
    setIsSignUp(signUp);
    setResumeUpgradeAfterAuth(resumeUpgrade);
    setShowUpgradeModal(false);
    setShowPostPurchaseAccountPrompt(false);
    setShowLoginModal(true);
  };

  const closeAuthModal = () => {
    setShowLoginModal(false);
    setResumeUpgradeAfterAuth(false);
    setLoginError(null);
  };

  const completeAuthFlow = () => {
    const shouldResumeUpgrade = resumeUpgradeAfterAuth;
    setShowLoginModal(false);
    setResumeUpgradeAfterAuth(false);
    if (shouldResumeUpgrade) {
      setShowUpgradeModal(true);
    }
  };

  const handleLogin = async (providerType: 'google' | 'apple' | 'email' = 'google') => {
    setLoginError(null);
    if (providerType === 'email') {
      if (!loginEmail || !loginPassword) {
        setLoginError("Please enter both email and password.");
        return;
      }
      setIsLoggingIn(true);
      try {
        if (isSignUp) {
          await createUserWithEmailAndPassword(auth, loginEmail, loginPassword);
        } else {
          await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
        }
        completeAuthFlow();
        setLoginEmail('');
        setLoginPassword('');
      } catch (error: any) {
        console.error("Email login failed", error);
        setLoginError(friendlyAuthError(error, isSignUp ? 'sign-up' : 'sign-in'));
      } finally {
        setIsLoggingIn(false);
      }
      return;
    }

    setIsLoggingIn(true);
    try {
      const provider = providerType === 'google'
        ? new GoogleAuthProvider()
        : new OAuthProvider('apple.com');

      if (providerType === 'apple') {
        provider.addScope('email');
        provider.addScope('name');
      }

      if (Capacitor.isNativePlatform()) {
        await handleNativeSocialLogin(providerType);
        completeAuthFlow();
      } else {
        await signInWithPopup(auth, provider);
        completeAuthFlow();
      }
    } catch (error: any) {
      console.error(`${providerType} login failed`, error);
      setLoginError(friendlyAuthError(error));
    } finally {
      setIsLoggingIn(false);
    }
  };

  // --- IAP Initialization ---
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    console.log("App: Initializing Native IAP...");
    setHasNativeProPurchase(hasStoredNativeProAccess(user?.uid));
    setNativeBusinessUntil(0);
    let live = true;

    const checkActivePurchases = async () => {
      try {
        const { purchases } = await InAppPurchase.getActivePurchases(nativePurchaseUserOptions(user?.uid));
        if (!live) return;
        const tier = purchaseTier(purchases);
        if (tier) await handleSuccessfulPurchase({ tier, purchases });
        else setNativeBusinessUntil(0);
      } catch (error) {
        console.error("App: Failed to check active purchases", error);
      }
    };

    void checkActivePurchases();
    const refresh = () => {if(document.visibilityState==='visible') void checkActivePurchases();};
    const timer = window.setInterval(refresh, 5 * 60 * 1000);
    document.addEventListener('visibilitychange',refresh);
    return () => {live=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  }, [user]);

  const handleSuccessfulPurchase = async ({ promptForAccount = false, tier = 'pro', purchases = [] }: { promptForAccount?: boolean; tier?: SubscriptionTier; purchases?: Array<StorePurchaseLike & {transactionId?:string;receipt?:string;userId?:string}> } = {}) => {
    const activeUser = auth.currentUser || user;
    const purchase = purchases.find(item => storeTier(item.productId, nativeProProductIds(), nativeBusinessProductIds()) === tier);
    // Preserve legacy Pro access if its old build didn't have server verification.
    // New plan replacements are preflighted before the payment sheet opens.
    let verify=tier==='business';
    if(tier==='pro'&&purchase&&(Capacitor.getPlatform()==='android'||purchase.userId)){
      const readiness=await fetch(billingApiUrl('/api/subscriptions/business/ready'),{signal:AbortSignal.timeout(15000)}).then(r=>r.json());
      verify=Boolean(readiness[Capacitor.getPlatform()]);
    }
    if (verify) {
      if (!purchase) throw Error('The store did not return a subscription purchase. Use Restore Purchases.');
      const token = await activeUser?.getIdToken();
      const response = await fetch(billingApiUrl('/api/subscriptions/verify'), {
        method:'POST',headers:{'Content-Type':'application/json',...(token ? {Authorization:`Bearer ${token}`} : {})},
        body:JSON.stringify({platform:Capacitor.getPlatform(),productId:purchase.productId,transactionId:purchase.transactionId,receipt:purchase.receipt,appAccountToken:purchase.userId}),
        signal:AbortSignal.timeout(25000),
      });
      const verified = await response.json();
      if (!response.ok || verified.tier !== tier || !Number.isFinite(verified.expiresAt) || verified.expiresAt <= Date.now()) throw Error(verified.error || 'Subscription verification could not finish. Restore Purchases; do not pay again.');
      if (auth.currentUser?.uid !== activeUser?.uid) return;
      // Store proof is checked on launch and restore; no permanent Business flag.
      setNativeBusinessUntil(tier==='business'?verified.expiresAt:0);
    }
    if(tier==='business'){
      setNativeProAccess(activeUser?.uid,false);
      setIsPro(false);
      if (promptForAccount) setShowUpgradeModal(false);
      if (!activeUser && promptForAccount) setShowPostPurchaseAccountPrompt(true);
      return;
    }

    setNativeProAccess(activeUser?.uid, true);
    setIsPro(true);
    if (promptForAccount) setShowUpgradeModal(false);

    if (!activeUser) {
      if (promptForAccount) {
        setShowPostPurchaseAccountPrompt(true);
      }
      return;
    }

    // Verified purchases already update Firestore through the backend. Legacy
    // local store access must not promote an unverified account permanently.
  };

  const handleRestorePurchases = async () => {
    setIsSyncing(true);

    if (Capacitor.isNativePlatform()) {
      try {
        console.log("App: Restoring Native Purchases...");
        const { purchases } = await InAppPurchase.restorePurchases(nativePurchaseUserOptions(user?.uid));
        const tier = purchaseTier(purchases);
        if (tier) {
          await handleSuccessfulPurchase({ promptForAccount: true, tier, purchases });
        } else {
          setNativeBusinessUntil(0);
          alert('No active Pro or Business subscription was found for this store account.');
        }
      } catch (error) {
        console.error("App: Restore failed", error);
        alert(error instanceof Error ? error.message : 'Restore failed. Connect and try again.');
      } finally {
        setIsSyncing(false);
      }
      return;
    }

    if (!user) {
      setIsSyncing(false);
      openAuthModal(false);
      return;
    }

    try {
      const response=await fetch(billingApiUrl('/api/subscriptions/restore'),{method:'POST',headers:{Authorization:`Bearer ${await user.getIdToken()}`},signal:AbortSignal.timeout(25000)});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Your subscription could not be restored.');
      if(!result.restored)alert('No active web subscription was found. Restore store purchases on the original Apple or Google Play device.');
    }catch(error){alert(error instanceof Error?error.message:'Subscription restore failed. Connect and retry.');}
    finally{setIsSyncing(false);}
  };

  const handleLogout = () => signOut(auth);

  const handlePrivacyAction = async (action: 'export' | 'clear') => {
    if (!user || privacyBusy) return;
    const uid = user.uid;
    if (!window.confirm(action === 'export'
      ? 'This private export includes client details, bank details and internal costs. Save it securely and do not send it to clients. Cloud file contents and original PDFs must be exported separately from Projects. Continue?'
      : 'Remove this account\'s downloaded projects, invoices and calculation history from this device? Cloud records are not deleted. Unsynced changes and pending invoice actions must be resolved first.')) return;
    setPrivacyBusy(true); setPrivacyMessage('');
    try {
      if (action === 'export') {
        const response = await fetch(getApiUrl('/api/privacy/export'), {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` }, signal: AbortSignal.timeout(60000),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || 'Export unavailable. Contact privacy support.');
        if (auth.currentUser?.uid !== uid) throw Error('Account changed. Export cancelled.');
        const local = { business: await readBusiness(uid), history: await getHistory(uid) };
        await downloadFile(await blobDataUrl(new Blob([JSON.stringify({ ...result, local }, null, 2)], { type: 'application/json' })), 'sparkys-private-records.json', 'application/json');
        setPrivacyMessage('Private records exported. Download original PDFs and images separately from Projects; this export lists cloud files but does not contain them.');
      } else {
        if (await pendingAction(uid)) throw Error('Resolve the pending invoice action first.');
        if (await hasPendingRams(uid)) throw Error('Resolve pending RAMS issues first.');
        await clearBusinessDeviceData(uid);
        await clearInvoiceDeviceData(uid);
        await clearRamsDeviceData(uid);
        clearLocalHistory(uid);
        setPrivacyMessage('Device copies cleared. Cloud records remain and can download again when Projects is opened. Previously exported files must be removed separately.');
      }
    } catch (error) { setPrivacyMessage(error instanceof Error ? error.message : 'Privacy action could not finish.'); }
    finally { setPrivacyBusy(false); }
  };

  const deletionProvider = useMemo(() => {
    const providerIds = user?.providerData.map(provider => provider.providerId) || [];
    if (providerIds.includes('password')) return 'password';
    if (providerIds.includes('google.com')) return 'google';
    if (providerIds.includes('apple.com')) return 'apple';
    return 'unknown';
  }, [user]);

  const reauthenticateForDeletion = async () => {
    if (!user) {
      throw new Error('No signed-in user');
    }

    if (deletionProvider === 'password') {
      if (!user.email || !deletePassword) {
        throw Object.assign(new Error('Password required'), { code: 'auth/invalid-credential' });
      }

      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, deletePassword)
      );
      return;
    }

    if (deletionProvider === 'google' || deletionProvider === 'apple') {
      if (Capacitor.isNativePlatform()) {
        const credential = await getNativeSocialCredential(deletionProvider);
        await reauthenticateWithCredential(user, credential);
        return;
      }

      const provider = deletionProvider === 'google'
        ? new GoogleAuthProvider()
        : new OAuthProvider('apple.com');

      if (deletionProvider === 'apple') {
        provider.addScope('email');
        provider.addScope('name');
      }

      await reauthenticateWithPopup(user, provider);
      return;
    }

    await user.getIdToken(true);
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (!window.confirm('Export records and original PDFs you need before requesting account deletion. This submits a privacy review request, not immediate erasure. Support must explain any legally required retention. Store/web subscriptions must be cancelled separately with the original provider. Continue?')) return;

    setDeleteError(null);
    setIsDeletingAccount(true);
    try {
      await reauthenticateForDeletion();
      const idToken = await user.getIdToken(true);
      const response = await fetch(getApiUrl('/api/delete-account'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ financialExportAcknowledged: true }),
        signal: AbortSignal.timeout(30000),
      });

      const result = await response.json().catch(() => ({ success: false }));
      if (response.ok && result.accepted) {
        setDeleteSuccess(true);
        setDeletePassword('');
        setPrivacyMessage(result.message);
      } else {
        throw new Error(result.error || "Failed to delete account");
      }
    } catch (error: any) {
      console.error("Deletion request failed.");
      setDeleteError(
        authErrorCode(error)
          ? friendlyAuthError(error, 'delete')
          : error instanceof Error ? error.message : 'The deletion request could not be recorded. Contact privacy support.'
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const readAndroidBillingDiagnostics = async (context: string) => {
    if (Capacitor.getPlatform() !== 'android') {
      return null;
    }

    setBillingDiagnosticsContext(sanitizeBillingDiagnosticText(context) || 'Unknown check');
    try {
      const snapshot = await (InAppPurchase as unknown as BillingDiagnosticsBridge).getBillingDiagnostics();
      const sanitizedSnapshot = sanitizeBillingDiagnosticSnapshot(snapshot);
      setBillingDiagnostics(sanitizedSnapshot);
      return sanitizedSnapshot;
    } catch (error) {
      const fallback: BillingDiagnosticSnapshot = {
        allowed: false,
        billingClientInitialized: false,
        billingClientReady: false,
        billingConnected: false,
        lastStage: 'diagnostic_bridge',
        failedCheck: 'diagnostic_bridge_unavailable',
        responseCode: null,
        debugMessage: sanitizeBillingDiagnosticText(error instanceof Error ? error.message : error) || 'Diagnostic bridge unavailable.',
        productDetailsReturned: false,
        eligibleOfferReturned: false,
        eligibleOfferCount: 0,
        selectedBasePlanId: 'none',
        selectedOfferId: 'none',
        requestedProductIds: nativeProProductIds(),
        returnedProductIds: []
      };
      setBillingDiagnostics(fallback);
      return fallback;
    }
  };

  const openAndroidBillingDiagnostics = async () => {
    setBillingDiagnosticsCopyStatus('idle');
    await readAndroidBillingDiagnostics('Manual diagnostic check');
    setShowBillingDiagnostics(true);
  };

  const copyAndroidBillingDiagnostics = async () => {
    if (!billingDiagnostics) return;

    const safeLines = [
      'The Sparkys Mate - Android billing diagnostics',
      'Diagnostic build only',
      `Context: ${sanitizeBillingDiagnosticText(billingDiagnosticsContext)}`,
      `Failed check: ${billingDiagnostics.failedCheck}`,
      `Last stage: ${billingDiagnostics.lastStage}`,
      `Response code: ${billingDiagnostics.responseCode ?? 'not supplied'}`,
      `Debug message: ${billingDiagnostics.debugMessage}`,
      `Purchases allowed: ${billingDiagnostics.allowed}`,
      `Billing client initialized: ${billingDiagnostics.billingClientInitialized}`,
      `Billing client ready: ${billingDiagnostics.billingClientReady}`,
      `Billing connected: ${billingDiagnostics.billingConnected}`,
      `Requested product IDs: ${billingDiagnostics.requestedProductIds.join(', ') || 'none'}`,
      `Returned product IDs: ${billingDiagnostics.returnedProductIds.join(', ') || 'none'}`,
      `Product details returned: ${billingDiagnostics.productDetailsReturned}`,
      `Eligible offer returned: ${billingDiagnostics.eligibleOfferReturned}`,
      `Eligible offer count: ${billingDiagnostics.eligibleOfferCount}`,
      `Selected base plan ID: ${billingDiagnostics.selectedBasePlanId}`,
      `Selected offer ID: ${billingDiagnostics.selectedOfferId}`
    ];
    const diagnosticText = safeLines.join('\n');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(diagnosticText);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = diagnosticText;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const copied = document.execCommand('copy');
        textArea.remove();
        if (!copied) throw new Error('Copy command was rejected.');
      }
      setBillingDiagnosticsCopyStatus('copied');
    } catch {
      setBillingDiagnosticsCopyStatus('error');
    }
  };

  const handleUpgrade = async () => {
    if (purchaseAttempt.current) return;
    const purchaseUser = auth.currentUser || user;
    console.log("App: handleUpgrade triggered", {
      hasUser: !!purchaseUser,
      effectiveIsPro,
      isNative: Capacitor.isNativePlatform(),
      platform: Capacitor.getPlatform()
    });

    if (upgradeTier === 'business' ? effectiveIsBusiness : effectiveIsPro && !effectiveIsBusiness) {
      console.log("App: User is already Pro, aborting upgrade.");
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      alert(STORE_ONLY_PURCHASE_MESSAGE);
      return;
    }

    purchaseAttempt.current = true;
    setIsUpgrading(true);

    // Use Native IAP if on mobile
    if (Capacitor.isNativePlatform()) {
      try {
        const productIds = nativeProductIds(upgradeTier);
        const purchasePlatform = Capacitor.getPlatform();
        // Query the whole store account, not only purchases mapped to this app UID.
        // Otherwise signing in differently could accidentally buy a second plan.
        const owned=await InAppPurchase.getActivePurchases({requireComplete:true} as any);
        const replacement=planReplacement(owned.purchases,upgradeTier,nativeProProductIds(),nativeBusinessProductIds());
        if(purchaseUser){
          const contextResponse=await fetch(billingApiUrl('/api/subscriptions/context'),{headers:{Authorization:`Bearer ${await purchaseUser.getIdToken()}`},signal:AbortSignal.timeout(20000),cache:'no-store'});
          const context=await contextResponse.json();
          if(!contextResponse.ok)throw Error(context.error||'Existing subscriptions could not be checked. No payment has been started.');
          if(context.invoicedBusiness)throw Error('Your organisation provides or has scheduled Business access. Contact your administrator before purchasing a personal subscription. No payment has been started.');
          if(context.webActive)throw Error('Change your existing subscription on the web where it was purchased. A separate store subscription will not be started.');
          if(context.native&&context.native.provider!==purchasePlatform)throw Error('Change your subscription through the original Apple or Google Play store. A second subscription will not be started.');
          if(context.unknownLegacyPro&&!replacement)throw Error('Restore your existing subscription on the device/store where it was purchased before changing plans. No new payment has been started.');
        }
        if(replacement?.samePlan){await handleSuccessfulPurchase({promptForAccount:true,tier:upgradeTier,purchases:owned.purchases});return;}
        if (upgradeTier === 'business' || replacement) {
          const readyResponse = await fetch(billingApiUrl('/api/subscriptions/business/ready'), {signal:AbortSignal.timeout(15000),cache:'no-store'});
          const ready = await readyResponse.json();
          if (!readyResponse.ok || !ready[purchasePlatform]) throw Error('Subscription purchases and plan changes are not available yet. No payment has been started.');
          if (nativeBusinessProductIds().some(id=>nativeProProductIds().includes(id))) throw Error('Business and Pro must use different store product IDs.');
        }
        console.log("App: Starting Native Purchase flow for:", productIds);

        // Query the native store directly. Readiness checks can report false while
        // BillingClient or StoreKit is still connecting; getProducts() already
        // waits for the Android connection and returns the actionable store result.

        console.info('[BillingDiagnostics] Requesting subscription products', {
          productIds,
          productType: PRO_PRODUCT_TYPE
        });
        const { products } = await InAppPurchase.getProducts({
          productIds:purchasePlatform==='ios'?[...nativeProProductIds(),...nativeBusinessProductIds()]:productIds,
          ...(purchasePlatform==='android'&&replacement?{preferBasePlan:true}:{}),
          productType: PRO_PRODUCT_TYPE as any
        });
        if(purchasePlatform==='ios')assertAppleSubscriptionGroup(products as Array<typeof products[number]&{subscriptionGroupId?:string}>,nativeProProductIds(),nativeBusinessProductIds());
        console.log("App: Store products returned ->", products);
        console.info('[BillingDiagnostics] Subscription product query completed', {
          requestedProductIds: productIds,
          returnedProductCount: products.length,
          returnedProducts: products.map(product => ({
            productId: product.productId,
            productType: product.productType,
            price: product.price,
            eligibleOfferReturned: Boolean((product as typeof product & { offerToken?: string }).offerToken)
          }))
        });

        const product = products.find(item => productIds.includes(item.productId));
        if (!product) {
          console.warn('[BillingDiagnostics] No matching product details were returned', {
            requestedProductIds: productIds
          });
          const { purchases } = await InAppPurchase.getActivePurchases(nativePurchaseUserOptions(purchaseUser?.uid));
          const tier = purchaseTier(purchases);
          if (tier === upgradeTier) {
            await handleSuccessfulPurchase({ promptForAccount: true, tier, purchases });
            return;
          }

          throw new Error(productUnavailableMessage(productIds));
        }

        const offerToken = (product as typeof product & { offerToken?: string }).offerToken;
        if (upgradeTier === 'business') validateBusinessStorePrice(product);
        if (purchasePlatform === 'android' && PRO_PRODUCT_TYPE === 'subscription' && !offerToken) {
          throw new Error(
            `Google Play returned ${product.productId}, but no eligible subscription base plan or offer was available for this account.`
          );
        }

        console.info('[BillingDiagnostics] Launching native purchase', {
          selectedProductId: product.productId,
          productType: PRO_PRODUCT_TYPE,
          eligibleOfferReturned: Boolean(offerToken)
        });
        const transaction = await InAppPurchase.purchaseProduct({
          productId: product.productId,
          productType: PRO_PRODUCT_TYPE as any,
          ...(purchasePlatform === 'android' && offerToken ? { offerToken } : {}),
          ...(purchasePlatform === 'android' && replacement ? {oldProductId:replacement.productId,oldPurchaseToken:androidReplacementToken(replacement.purchase.receipt)} : {}),
          ...(purchasePlatform === 'ios' ? {userId:crypto.randomUUID()} : nativePurchaseUserOptions(purchaseUser?.uid))
        } as any) as any;
        console.info('[BillingDiagnostics] Native purchase call completed', {
          productId: product.productId,
          status: transaction?.status,
          errorCode: transaction?.errorCode,
          errorMessage: transaction?.errorMessage,
          hasTransactionId: Boolean(transaction?.transactionId)
        });

        if (transaction?.transactionId || transaction?.status === 'purchased') {
          if(purchasePlatform==='ios'&&replacement){
            const refreshed=await InAppPurchase.getActivePurchases({});
            const current=purchaseTier(refreshed.purchases);
            if(!current)throw Error('The plan change is processing. Restore Purchases to refresh access; do not pay again.');
            await handleSuccessfulPurchase({promptForAccount:true,tier:current,purchases:refreshed.purchases});
            if(current!==upgradeTier)alert('Your plan change is scheduled with Apple. Your current plan remains available until Apple applies the change at renewal.');
            return;
          }
          if (transaction.productId !== product.productId) throw Error('The store returned a different product. Use Restore Purchases; do not purchase again.');
          console.log("App: Native Purchase success ->", transaction.transactionId);
          await handleSuccessfulPurchase({ promptForAccount: true, tier:upgradeTier, purchases:[transaction] });
        } else if (transaction?.status === 'pending') {
          alert('Your purchase is pending approval in the store. Your subscription will unlock once the purchase completes.');
        } else {
          throw new Error(transaction?.errorMessage || transaction?.errorCode || 'The store did not complete the purchase.');
        }
      } catch (error: any) {
        console.error("App: Native Purchase failed", error);
        const failedAttemptDiagnostics = await readAndroidBillingDiagnostics('Go Pro purchase attempt failed');
        try {
          const { purchases } = await InAppPurchase.getActivePurchases(nativePurchaseUserOptions(purchaseUser?.uid));
          const tier = purchaseTier(purchases);
          if (tier === upgradeTier) {
            await handleSuccessfulPurchase({ promptForAccount: true, tier, purchases });
            return;
          }
        } catch (restoreError) {
          console.error("App: Failed to re-check purchases after purchase error", restoreError);
        }
        if (failedAttemptDiagnostics && ANDROID_BILLING_DIAGNOSTICS_ENABLED) {
          setBillingDiagnostics(failedAttemptDiagnostics);
          setBillingDiagnosticsCopyStatus('idle');
          setShowBillingDiagnostics(true);
        }
        const failureMessage = String(error?.message || 'Unknown error').trim().replace(/[.\s]+$/, '');
        const billingResponse = failedAttemptDiagnostics?.responseCode;
        const billingStage = failedAttemptDiagnostics?.lastStage;
        const billingDetail = billingResponse === null || billingResponse === undefined
          ? ''
          : ` Google Play response: ${billingResponse}${billingStage ? ` at ${billingStage}` : ''}.`;
        alert(`Purchase failed: ${failureMessage}.${billingDetail} Please try again.`);
      } finally {
        purchaseAttempt.current = false;
        setIsUpgrading(false);
      }
      return;
    }

  };

  const manageExistingWebSubscription = async () => {
    try {
      const current = auth.currentUser;
      if (!current) { openAuthModal(false, false); return; }
      const response = await fetch(billingApiUrl('/api/subscriptions/manage-web'), {
        method: 'POST', headers: { Authorization: `Bearer ${await current.getIdToken()}` },
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Subscription management is unavailable.');
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com') throw Error('Invalid billing management link.');
      await openExternalUrl(url.href);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Subscription management is unavailable.');
    }
  };

  const coreIssue = (cableCoreType === CableCoreType.SINGLE_CORE) !== (cableType === CableType.PVC_SINGLE)
    ? 'The selected cable construction does not match the core selection. Select a matching cable type.' : null;
  const selectionIssue = coreIssue || (mode === AppMode.CABLE_FINDER
    ? getCombinationIssue(cableType, method, supplyType)
    : getCircuitInputIssue(cableType, method, supplyType, 30, 1, deviceType, cableOptions));
  const sourceIds = getSourceIdsForTool(mode, cableType);

  const result = useMemo(() => {
    if (mode === AppMode.SMART_CIRCUIT || mode === AppMode.VOLTAGE_DROP) {
      if (selectionIssue) return null;
      return calculateCircuit(
        parseFloat(loadKw) || 0,
        parseFloat(lengthM) || 0,
        supplyType,
        method,
        cableType,
        circuitType,
        30, // ambientTemp
        1,  // groupingCount
        ze.trim() === '' ? NaN : Number(ze),
        deviceType,
        undefined,
        cableOptions
      );
    }
    return null;
  }, [loadKw, lengthM, supplyType, method, cableType, circuitType, mode, ze, deviceType, selectionIssue, cableOptions]);

  const threePhaseResult = useMemo(() => {
    if (mode === AppMode.THREE_PHASE) {
      const p = parseFloat(loadKw) || 0;
      if (p <= 0) return null;

      if (supplyType === SupplyType.THREE_PHASE) {
        // I = Power / (1.732 × 400 × 0.9)
        const current = (p * 1000) / (1.732 * 400 * 0.9);
        return current;
      } else {
        // I = Power / (230 × 0.9)
        const current = (p * 1000) / (230 * 0.9);
        return current;
      }
    }
    return null;
  }, [loadKw, mode, supplyType]);

  const cableFinderResult = useMemo(() => {
    if (mode === AppMode.CABLE_FINDER) {
      const current = parseFloat(targetCurrent) || 0;
      if (!Number.isFinite(current) || current <= 0 || selectionIssue) return null;
      const cableSizes = getCableRows(cableType, method, supplyType, cableOptions.operatingTemperature);
      return cableSizes.find(c => c.capacity[method] >= current);
    }
    return null;
  }, [targetCurrent, method, cableType, mode, selectionIssue, supplyType, cableOptions]);

  const currentHistoryPayload = useMemo<HistorySavePayload | null>(() => {
    if (mode === AppMode.CABLE_FINDER) {
      const target = parseFloat(targetCurrent) || 0;
      if (target <= 0 || !cableFinderResult) return null;

      return {
        type: 'cable_finder',
        title: `Cable Finder: ${target}A`,
        inputs: { targetCurrent, cableCoreType, cableType, method, supplyType, operatingTemperature: cableOptions.operatingTemperature },
        results: {
          recommendedCableSize: cableFinderResult.size,
          methodCapacity: cableFinderResult.capacity[method],
          mvAm: cableFinderResult.mvAm,
          spareCapacity: cableFinderResult.capacity[method] - target,
          isAdequate: true,
          ratingTable: cableFinderResult.ratingTable, capacityColumn: cableFinderResult.capacityColumn,
          loadedConductors: cableFinderResult.loadedConductors, operatingTemperature: cableFinderResult.operatingTemperature
        }
      };
    }

    if ((mode === AppMode.SMART_CIRCUIT || mode === AppMode.VOLTAGE_DROP) && result) {
      return {
        type: 'circuit',
        title: mode === AppMode.VOLTAGE_DROP
          ? `AC Voltage Drop: ${loadKw}kW / ${lengthM}m`
          : `Circuit: ${loadKw}kW / ${lengthM}m`,
        inputs: { loadKw, lengthM, supplyType, cableCoreType, cableType, method, circuitType, ze, deviceType, ...cableOptions },
        results: {
          ...result,
          cableSize: result.cableSize,
          protectiveDevice: result.protectiveDevice,
          voltageDrop: result.voltageDrop,
          voltageDropPercentage: result.voltageDropPercentage,
          isCompliant: result.isCompliant,
          zs: result.zs,
          maxZs: result.maxZs
        }
      };
    }

    return null;
  }, [mode, targetCurrent, cableFinderResult, cableCoreType, cableType, method, result, loadKw, lengthM, supplyType, circuitType, ze, deviceType, cableOptions]);

  useEffect(() => {
    setHistorySaveStatus('idle');
  }, [currentHistoryPayload]);

  const setTimedHistorySaveStatus = useCallback((status: HistorySaveStatus) => {
    if (historySaveResetRef.current) {
      window.clearTimeout(historySaveResetRef.current);
      historySaveResetRef.current = null;
    }

    setHistorySaveStatus(status);

    if (status === 'saved' || status === 'error') {
      historySaveResetRef.current = window.setTimeout(() => {
        setHistorySaveStatus('idle');
        historySaveResetRef.current = null;
      }, 2200);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (historySaveResetRef.current) {
        window.clearTimeout(historySaveResetRef.current);
      }
    };
  }, []);

  const handleCalculate = () => {
    setShowResults(true);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mode, showResults]);

  const handleShareResult = async (text: string) => {
    setSharedText(text.includes('DATA SOURCES -') ? text : `${text}\n\n${formatSourceNotes(sourceIds)}`);
    setShowTextShareMenu(true);
  };

  const handleCopySharedText = async () => {
    if (!sharedText) return;
    try {
      await navigator.clipboard.writeText(sharedText);
      setIsCopying(true);
      setTimeout(() => setIsCopying(false), 2000);
    } catch (err) {
      console.error('Clipboard error:', err);
    }
  };

  const handleNativeShareText = async () => {
    if (!sharedText) return;
    try {
      if (Capacitor.isNativePlatform()) {
        await NativeShare.share({
          title: 'The Sparkys Mate Calculation',
          text: sharedText
        });
        return;
      }

      if (navigator.share) {
        await navigator.share({ title: 'The Sparkys Mate Calculation', text: sharedText });
        return;
      }

      await handleCopySharedText();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      console.error('Share error, falling back to clipboard:', err);
      await handleCopySharedText();
    }
  };

  const handleDownloadSharedTextPDF = async () => {
    if (!sharedText) return;
    window.dispatchEvent(new CustomEvent('sparkys-preview-calculation', {detail:{text:sharedText}}));
    setShowTextShareMenu(false);
  };

  const handleShareText = async () => {
    if (!result) return;
    const text = `
⚡ CIRCUIT CALCULATION SUMMARY ⚡
--------------------------------
Mode: ${mode === AppMode.SMART_CIRCUIT ? 'Smart Circuit' : 'Voltage Drop'}
Type: ${cableType}
Core: ${cableCoreType}
Load: ${loadKw} kW
Length: ${lengthM} m
Cable: ${result.cableSize} mm²
CPC: ${result.cpcSize ?? 'not recorded'} mm2 (${result.cpcArrangement ?? 'not recorded'})
Device: ${result.protectiveDevice} A (${deviceType})
V-Drop: ${result.voltageDrop.toFixed(2)}V (${result.voltageDropPercentage.toFixed(1)}%)
Status: ${result.isCompliant ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}
--------------------------------
Calculated via The Sparkys Mate
${formatSourceNotes(sourceIds, result.assumptions)}
    `.trim();

    const copyToClipboard = async () => {
      try {
        await navigator.clipboard.writeText(text);
        setIsCopying(true);
        setTimeout(() => setIsCopying(false), 2000);
      } catch (err) {
        console.error('Clipboard error:', err);
      }
    };

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Circuit Calculation',
          text: text,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return; // User cancelled, do nothing
        }
        console.error('Share error, falling back to clipboard:', err);
        await copyToClipboard();
      }
    } else {
      await copyToClipboard();
    }
  };

  const handleDownloadImage = async () => {
    if (!shareRef.current || isSavingImage) return;
    setIsSavingImage(true);
    try {
      const dataUrl = await toPng(shareRef.current, {
        cacheBust: true,
        backgroundColor: '#0a0a0a',
        style: {
          borderRadius: '0',
        }
      });

      await downloadFile(dataUrl, `bs7671-calc-${Date.now()}.png`, 'image/png');

      // Show success state for a moment
      setTimeout(() => setIsSavingImage(false), 2000);
    } catch (err) {
      console.error('Error generating image:', err);
      setIsSavingImage(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!currentHistoryPayload) return;
    const snapshot: CalculationHistory = {
      id: crypto.randomUUID(), userId:user?.uid || 'local',
      type:currentHistoryPayload.type,title:currentHistoryPayload.title,
      inputs:structuredClone(currentHistoryPayload.inputs),
      results:{...structuredClone(currentHistoryPayload.results),dataSourceIds:sourceIds},
      createdAt:new Date().toISOString()
    };
    window.dispatchEvent(new CustomEvent('sparkys-preview-calculation', {detail:{snapshot}}));
    setShowShareMenu(false);
  };

  const handleSaveHistory = async () => {
    if (isSavingHistory) return;
    if (!currentHistoryPayload) {
      setTimedHistorySaveStatus('error');
      return;
    }

    setTimedHistorySaveStatus('saving');
    try {
      await saveCalculation(
        user?.uid,
        currentHistoryPayload.type,
        currentHistoryPayload.title,
        currentHistoryPayload.inputs,
        currentHistoryPayload.results
      );
      setTimedHistorySaveStatus('saved');
    } catch (error) {
      console.error('Error saving to history:', error);
      setTimedHistorySaveStatus('error');
    }
  };

  useEffect(() => {
    if (!currentHistoryPayload || !showResults) return;

    const signature = JSON.stringify(currentHistoryPayload);
    if (lastSavedHistoryRef.current === signature) return;
    lastSavedHistoryRef.current = signature;

    saveCalculation(user?.uid, currentHistoryPayload.type, currentHistoryPayload.title, currentHistoryPayload.inputs, currentHistoryPayload.results).catch(error => {
      console.error('Error auto-saving calculation history:', error);
    });
  }, [currentHistoryPayload, showResults, user]);

  const leaveCurrentPage = (destination: AppMode) => {
    setMode(destination);
    setShowResults(false);
    setLoadKw('');
    setLengthM('');
    setTargetCurrent('');
  };

  const goHome = () => leaveCurrentPage(AppMode.HOME);
  const goBack = () => leaveCurrentPage(backDestination(mode));

  const handleModeChange = (newMode: AppMode) => {
    const proModes = [
      AppMode.SMART_CIRCUIT,
      AppMode.FAULT_CURRENT,
      AppMode.EARTH_ELECTRODE,
      AppMode.MAX_LENGTH,
      AppMode.CABLE_RESISTANCE,
      AppMode.PROTECTIVE_DEVICE_SELECTOR,
      AppMode.THREE_PHASE_MOTOR
    ];

    if (proModes.includes(newMode) && !effectiveIsPro) {
      openUpgrade('pro');
      return;
    }
    setMode(newMode);
    setShowResults(false);

    recordToolUse(newMode, user?.uid);
    if (newMode === AppMode.PROJECTS) setHomeProjectId('');
  };

  const renderHome = (catalogue = false) => (
    <motion.div
      key={catalogue ? 'design' : 'home'}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
    >
      {!catalogue && <><div className="sm:col-span-2 mb-4 sm:mb-6 flex justify-between items-start gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-1 tracking-tight">The Sparkys Mate</h2>
          <p className="text-gray-500 text-sm font-medium">Precision electrical engineering suite.</p>
        </div>
        {!effectiveIsPro && (
          <button
            onClick={() => openUpgrade('pro')}
            className="bg-emerald-500/10 text-emerald-500 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
          >
            <Crown size={12} />
            Go Pro
          </button>
        )}
      </div>

      {/* Regulatory Status Card */}
      <div className="sm:col-span-2 bg-hardware-card p-5 sm:p-6 rounded-3xl border border-hardware-border mb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-emerald-500" size={18} />
            <h3 className="font-bold text-white">BS 7671 Compliance</h3>
          </div>
          <button
            onClick={() => refreshRegulatoryInfo({ force: true })}
            disabled={isCheckingUpdates}
            className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest hover:text-emerald-400 transition-colors disabled:opacity-50"
          >
            {isCheckingUpdates ? 'Checking...' : 'Check for Updates'}
          </button>
        </div>

        {!hasApiKey && (
          <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl">
            <p className="text-[10px] text-orange-200 leading-relaxed">
              <span className="font-bold uppercase block mb-1">Billing Required</span>
              Real-time regulatory checks require a Gemini API key with billing enabled.
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline ml-1">Learn more</a>
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">Current Standard</p>
            <p className="text-white font-mono text-sm">{regulatoryInfo.version}</p>
          </div>
          <div>
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">Latest Amendment</p>
            <p className="text-white font-mono text-sm">{regulatoryInfo.amendment}</p>
          </div>
        </div>
        <p className="text-gray-500 text-[10px] mt-4 leading-relaxed italic">
          * Regulatory news does not update the calculation tables. Dataset sources and editions are shown with each tool; legacy data is not source-verified.
        </p>
        {regulatoryCheckMessage && (
          <p className="text-emerald-400 text-[10px] mt-3 leading-relaxed">
            {regulatoryCheckMessage}
          </p>
        )}
      </div>

      <HomeSummary key={user?.uid || 'guest'} uid={user?.uid} business={effectiveIsBusiness} pro={effectiveIsPro}
        upgradeBusiness={() => openUpgrade('business')}
        openTool={handleModeChange} openProjects={() => handleModeChange(AppMode.PROJECTS)}
        openProject={id => { setHomeProjectId(id); setMode(AppMode.PROJECTS); setShowResults(false); }} />
      </>}

      {catalogue && <>
      <h2 className="sm:col-span-2 text-xl font-bold text-white">Calculation &amp; Design Tools</h2>

      {/* Free Tools Section */}
      <p className="sm:col-span-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1">Free Tools</p>

      <button
        onClick={() => handleModeChange(AppMode.ZS_CALCULATOR)}
        className="bg-hardware-card p-5 sm:p-6 rounded-3xl border border-hardware-border flex items-center gap-4 hover:bg-[#1c1d21] transition-all group active:scale-[0.98]"
      >
        <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
          <Gauge size={28} />
        </div>
        <div className="text-left">
          <h3 className="font-bold text-lg text-white">Zs Calculator</h3>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Loop Impedance Check</p>
        </div>
        <ChevronRight className="ml-auto text-gray-700 group-hover:text-emerald-500 transition-colors" />
      </button>

      <button
        onClick={() => handleModeChange(AppMode.VOLTAGE_DROP)}
        className="bg-hardware-card p-5 sm:p-6 rounded-3xl border border-hardware-border flex items-center gap-4 hover:bg-[#1c1d21] transition-all group active:scale-[0.98]"
      >
        <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
          <TrendingDown size={28} />
        </div>
        <div className="text-left">
          <h3 className="font-bold text-lg text-white">AC Voltage Drop</h3>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Compliance Check</p>
        </div>
        <ChevronRight className="ml-auto text-gray-700 group-hover:text-blue-500 transition-colors" />
      </button>

      <button
        onClick={() => handleModeChange(AppMode.DC_VOLTAGE_DROP)}
        className="bg-hardware-card p-5 sm:p-6 rounded-3xl border border-hardware-border flex items-center gap-4 hover:bg-[#1c1d21] transition-all group active:scale-[0.98]"
      >
        <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
          <BatteryCharging size={28} />
        </div>
        <div className="text-left">
          <h3 className="font-bold text-lg text-white">DC Voltage Drop</h3>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Cable Sizing & Drops</p>
        </div>
        <ChevronRight className="ml-auto text-gray-700 group-hover:text-emerald-500 transition-colors" />
      </button>

      <button
        onClick={() => handleModeChange(AppMode.THREE_PHASE)}
        className="bg-hardware-card p-5 sm:p-6 rounded-3xl border border-hardware-border flex items-center gap-4 hover:bg-[#1c1d21] transition-all group active:scale-[0.98]"
      >
        <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
          <Calculator size={28} />
        </div>
        <div className="text-left">
          <h3 className="font-bold text-lg text-white">Power Calculator</h3>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">kW / Amps Converter</p>
        </div>
        <ChevronRight className="ml-auto text-gray-700 group-hover:text-purple-500 transition-colors" />
      </button>

      <button
        onClick={() => handleModeChange(AppMode.CABLE_FINDER)}
        className="bg-hardware-card p-5 sm:p-6 rounded-3xl border border-hardware-border flex items-center gap-4 hover:bg-[#1c1d21] transition-all group active:scale-[0.98]"
      >
        <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
          <Search size={28} />
        </div>
        <div className="text-left">
          <h3 className="font-bold text-lg text-white">Cable Finder</h3>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Size by Capacity</p>
        </div>
        <ChevronRight className="ml-auto text-gray-700 group-hover:text-purple-500 transition-colors" />
      </button>

      <button
        onClick={() => handleModeChange(AppMode.HISTORY)}
        className="bg-hardware-card p-5 sm:p-6 rounded-3xl border border-hardware-border flex items-center gap-4 hover:bg-[#1c1d21] transition-all group active:scale-[0.98]"
      >
        <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
          <HistoryIcon size={28} />
        </div>
        <div className="text-left">
          <h3 className="font-bold text-lg text-white">History</h3>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Past Calculations</p>
        </div>
        <ChevronRight className="ml-auto text-gray-700 group-hover:text-blue-500 transition-colors" />
      </button>

      {/* Pro Tools Section */}
      <div className="sm:col-span-2 mt-4 mb-2">
        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1 ml-1">Pro Features</p>
      </div>

      <button
        onClick={() => handleModeChange(AppMode.SMART_CIRCUIT)}
        className="sm:col-span-2 bg-hardware-card p-5 sm:p-6 rounded-3xl border border-hardware-border flex items-center gap-4 hover:bg-[#1c1d21] transition-all group active:scale-[0.98] relative overflow-hidden"
      >
        <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform hardware-glow">
          <LayoutGrid size={28} />
        </div>
        <div className="text-left">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-white">Smart Circuit Designer</h3>
            {!effectiveIsPro && <Lock size={14} className="text-gray-600" />}
          </div>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Full BS 7671 Design</p>
        </div>
        {!effectiveIsPro && (
          <div className="absolute top-3 right-10 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-wider">
            PRO
          </div>
        )}
        <ChevronRight className="ml-auto text-gray-700 group-hover:text-emerald-500 transition-colors" />
      </button>

      <div className="sm:col-span-2 grid grid-cols-2 gap-3 sm:gap-4">
        <button
          onClick={() => handleModeChange(AppMode.FAULT_CURRENT)}
          className="bg-hardware-card p-5 rounded-3xl border border-hardware-border flex flex-col gap-3 hover:bg-[#1c1d21] transition-all group active:scale-[0.98] relative overflow-hidden"
        >
          <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
            <Zap size={20} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-white">Fault Current</h3>
              {!effectiveIsPro && <Lock size={10} className="text-gray-600" />}
            </div>
            <p className="text-gray-500 text-[8px] font-bold uppercase tracking-wider">kA Calculator</p>
          </div>
          {!effectiveIsPro && (
            <div className="absolute top-3 right-3 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider">
              PRO
            </div>
          )}
        </button>

        <button
          onClick={() => handleModeChange(AppMode.CABLE_RESISTANCE)}
          className="bg-hardware-card p-5 rounded-3xl border border-hardware-border flex flex-col gap-3 hover:bg-[#1c1d21] transition-all group active:scale-[0.98] relative overflow-hidden"
        >
          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
            <Cable size={20} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-white">Resistance</h3>
              {!effectiveIsPro && <Lock size={10} className="text-gray-600" />}
            </div>
            <p className="text-gray-500 text-[8px] font-bold uppercase tracking-wider">R1 + R2 Calculator</p>
          </div>
          {!effectiveIsPro && (
            <div className="absolute top-3 right-3 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider">
              PRO
            </div>
          )}
        </button>

        <button
          onClick={() => handleModeChange(AppMode.MAX_LENGTH)}
          className="bg-hardware-card p-5 rounded-3xl border border-hardware-border flex flex-col gap-3 hover:bg-[#1c1d21] transition-all group active:scale-[0.98] relative overflow-hidden"
        >
          <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
            <Ruler size={20} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-white">Max Length</h3>
              {!effectiveIsPro && <Lock size={10} className="text-gray-600" />}
            </div>
            <p className="text-gray-500 text-[8px] font-bold uppercase tracking-wider">Length Limits</p>
          </div>
          {!effectiveIsPro && (
            <div className="absolute top-3 right-3 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider">
              PRO
            </div>
          )}
        </button>

        <button
          onClick={() => handleModeChange(AppMode.EARTH_ELECTRODE)}
          className="bg-hardware-card p-5 rounded-3xl border border-hardware-border flex flex-col gap-3 hover:bg-[#1c1d21] transition-all group active:scale-[0.98] relative overflow-hidden"
        >
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Globe size={20} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-white">TT Electrode</h3>
              {!effectiveIsPro && <Lock size={10} className="text-gray-600" />}
            </div>
            <p className="text-gray-500 text-[8px] font-bold uppercase tracking-wider">Earth Resistance</p>
          </div>
          {!effectiveIsPro && (
            <div className="absolute top-3 right-3 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider">
              PRO
            </div>
          )}
        </button>

        <button
          onClick={() => handleModeChange(AppMode.PROTECTIVE_DEVICE_SELECTOR)}
          className="bg-hardware-card p-5 rounded-3xl border border-hardware-border flex flex-col gap-3 hover:bg-[#1c1d21] transition-all group active:scale-[0.98] relative overflow-hidden"
        >
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Shield size={20} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-white leading-tight">Protective Device Selector</h3>
              {!effectiveIsPro && <Lock size={10} className="text-gray-600 shrink-0" />}
            </div>
            <p className="text-gray-500 text-[8px] font-bold uppercase tracking-wider mt-1">MCB & Fuse Suggestion</p>
          </div>
          {!effectiveIsPro && (
            <div className="absolute top-3 right-3 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider">
              PRO
            </div>
          )}
        </button>

        <button
          onClick={() => handleModeChange(AppMode.THREE_PHASE_MOTOR)}
          className="bg-hardware-card p-5 rounded-3xl border border-hardware-border flex flex-col gap-3 hover:bg-[#1c1d21] transition-all group active:scale-[0.98] relative overflow-hidden"
        >
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Cpu size={20} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-white">3-Phase Motor</h3>
              {!effectiveIsPro && <Lock size={10} className="text-gray-600" />}
            </div>
            <p className="text-gray-500 text-[8px] font-bold uppercase tracking-wider">FLC & Starter Sizing</p>
          </div>
          {!effectiveIsPro && (
            <div className="absolute top-3 right-3 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider">
              PRO
            </div>
          )}
        </button>
      </div>

      {!effectiveIsPro && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="sm:col-span-2 p-6 sm:p-8 bg-emerald-500 rounded-[32px] text-black relative overflow-hidden group cursor-pointer mt-4"
          onClick={() => openUpgrade('pro')}
        >
          <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 transition-transform">
            <Crown size={120} />
          </div>
          <div className="relative z-10">
            <h3 className="text-3xl font-black mb-2 uppercase tracking-tighter">1 Month Free Trial</h3>
            <p className="font-bold text-black/70 mb-6 max-w-md">Try the full BS 7671 engineering suite for free. No commitment, cancel anytime. Just £5.99/mo after trial.</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openUpgrade('pro');
              }}
              disabled={isUpgrading}
              className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-zinc-900 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isUpgrading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                'Start Free Trial'
              )}
            </button>
          </div>
        </motion.div>
      )}
      </>}
    </motion.div>
  );

  if (isAuthLoading || isSyncing) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-6">
          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <div className="text-center">
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest animate-pulse mb-2">
              {isSyncing ? "Syncing Subscription..." : "Initializing Suite..."}
            </p>
            <p className="text-gray-700 text-[8px] uppercase tracking-widest">The Sparkys Mate v1.0.21</p>
          </div>
        </div>
      </div>
    );
  }

  const saveHistoryButtonClass = historySaveStatus === 'error'
    ? 'flex-1 bg-red-500/10 border border-red-500/30 py-5 rounded-3xl font-bold text-red-400 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50'
    : 'flex-1 bg-emerald-500/10 border border-emerald-500/20 py-5 rounded-3xl font-bold text-emerald-500 hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50';
  const saveHistoryButtonLabel = historySaveStatus === 'saving'
    ? 'Saving...'
    : historySaveStatus === 'saved'
      ? 'Saved'
      : historySaveStatus === 'error'
        ? 'Save failed'
        : 'Save History';

  return (
    <div className={`min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30`}>
      {/* Header */}
      {!cleanMode && (
        <header id="main-header" className="bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5 px-4 sm:px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 sticky top-0 z-20">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div id="header-logo" className="flex items-center gap-2 cursor-pointer" onClick={goHome}>
              <HeaderLogoMark />
              <h1 className="font-bold text-lg tracking-tight">The Sparkys Mate</h1>
            </div>
            <div className="flex items-center gap-3">
              {effectiveIsPro && (
                <div id="pro-badge" className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded border border-emerald-500/20 text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                  <Star size={8} fill="currentColor" />
                  {effectiveIsBusiness ? 'Business' : 'Pro'}
                </div>
              )}
              {user ? (
                <button id="settings-button" onClick={() => setShowSettingsModal(true)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <UserIcon size={20} className="text-gray-400" />
                  )}
                </button>
              ) : (
                <button
                  id="login-button-main"
                  onClick={() => openAuthModal(false)}
                  className="bg-emerald-500 text-black px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-colors flex items-center gap-2"
                >
                  <LogIn size={12} />
                  Sign In
                </button>
              )}
              {mode !== AppMode.HOME && (
                <button id="home-nav-button" onClick={goHome} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <LayoutGrid size={20} className="text-gray-400" />
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      {cleanMode && (
        <button
          onClick={() => setCleanMode(false)}
          className="fixed top-4 right-4 z-[100] bg-white/10 hover:bg-white/20 p-3 rounded-full backdrop-blur-md border border-white/10 text-white/50 hover:text-white transition-all shadow-2xl"
          title="Exit Clean Mode"
        >
          <X size={20} />
        </button>
      )}

      <main className={`${mode === AppMode.PROJECTS ? 'max-w-4xl' : mode === AppMode.HOME || mode === AppMode.DESIGN ? 'max-w-2xl' : 'max-w-lg'} mx-auto px-4 sm:px-6 pt-5 sm:pt-6 ${cleanMode ? 'pb-6' : 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]'}`}>
        <AnimatePresence mode="wait">
          {mode === AppMode.HOME ? (
            renderHome()
          ) : mode === AppMode.DESIGN ? (
            renderHome(true)
          ) : mode === AppMode.ZS_CALCULATOR ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1">Zs Calculator</h2>
              </div>
              <ZsCalculator onShare={handleShareResult} />
            </motion.div>
          ) : mode === AppMode.FAULT_CURRENT ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1 text-orange-500">Fault Current</h2>
              </div>
              <FaultCurrentCalculator onShare={handleShareResult} />
            </motion.div>
          ) : mode === AppMode.CABLE_RESISTANCE ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1 text-blue-500">Cable Resistance</h2>
              </div>
              <CableResistanceCalculator onShare={handleShareResult} />
            </motion.div>
          ) : mode === AppMode.MAX_LENGTH ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1 text-purple-500">Max Cable Length</h2>
              </div>
              <MaxLengthCalculator onShare={handleShareResult} />
            </motion.div>
          ) : mode === AppMode.EARTH_ELECTRODE ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1 text-emerald-500">TT Earth Electrode</h2>
              </div>
              <EarthElectrodeCalculator onShare={handleShareResult} />
            </motion.div>
          ) : mode === AppMode.SMART_CIRCUIT ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1 text-emerald-500">Smart Circuit Designer</h2>
              </div>
              <SmartCircuitDesigner onShare={handleShareResult} />
            </motion.div>
          ) : mode === AppMode.PROTECTIVE_DEVICE_SELECTOR ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1 text-emerald-500">Protective Device Selector</h2>
              </div>
              <ProtectiveDeviceSelector onShare={handleShareResult} />
            </motion.div>
          ) : mode === AppMode.DC_VOLTAGE_DROP ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1 text-emerald-500">DC Voltage Drop</h2>
              </div>
              <DcVoltageDropCalculator onShare={handleShareResult} />
            </motion.div>
          ) : mode === AppMode.THREE_PHASE ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1 text-orange-500">Power Calculator</h2>
              </div>
              <ThreePhaseCalculator onShare={handleShareResult} />
            </motion.div>
          ) : mode === AppMode.THREE_PHASE_MOTOR ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1 text-emerald-500">3-Phase Motor Calculator</h2>
              </div>
              <ThreePhaseMotorCalculator onShare={handleShareResult} />
            </motion.div>
          ) : mode === AppMode.PROJECTS ? (
            !effectiveIsBusiness ? <section className="py-5">
              <div className="flex items-center gap-3 text-emerald-500 mb-5"><Crown size={28}/><h2 className="text-2xl font-bold">Business</h2></div>
              <p className="text-xl font-bold mb-2">£14.99/month</p>
              <p className="text-gray-400 text-sm mb-6">All Pro tools plus Projects, quotes, invoices and branded client documents.</p>
              <button onClick={()=>openUpgrade('business')} className="w-full min-h-14 bg-emerald-500 text-black px-4 py-4 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2"><Crown size={18}/>Get Business</button>
              <BusinessArchive onSignIn={()=>openAuthModal(false)}/>
            </section> : <ProjectsWorkspace key={user?.uid || 'guest'} initialProjectId={homeProjectId} onSignIn={() => setShowLoginModal(true)} onReopen={snapshot => {
              const input = snapshot.inputs;
              if (!['circuit', 'cable_finder'].includes(snapshot.type) || (snapshot.type === 'circuit' && input.loadKw === undefined)) return false;
              if (input.supplyType) setSupplyType(input.supplyType);
              if (input.cableCoreType) setCableCoreType(input.cableCoreType);
              if (input.cableType) setCableType(input.cableType);
              if (input.method) setMethod(input.method);
              if (snapshot.type === 'cable_finder') {setTargetCurrent(String(input.targetCurrent));setMode(AppMode.CABLE_FINDER);}
              else {setLoadKw(String(input.loadKw));setLengthM(String(input.lengthM));setZe(String(input.ze ?? '0.35'));setCircuitType(input.circuitType || CircuitType.OTHER);setDeviceType(input.deviceType || DeviceType.MCB_B);setMode(AppMode.VOLTAGE_DROP);}
              const options = {...input};
              for (const key of ['loadKw','lengthM','ze','method','cableType','supplyType','cableCoreType','deviceType','circuitType','targetCurrent']) delete options[key];
              setCableOptions(options);setShowResults(false);return true;
            }}/>
          ) : mode === AppMode.HISTORY ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1 text-blue-500">Calculation History</h2>
              </div>
              <History key={user?.uid || 'guest'} userId={user?.uid} onSelect={item => window.dispatchEvent(new CustomEvent('sparkys-save-to-project', {detail:item}))} />
            </motion.div>
          ) : mode === AppMode.PRIVACY ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1">Privacy Policy</h2>
              </div>

              <div className="bg-hardware-card p-5 sm:p-6 rounded-3xl border border-hardware-border space-y-5 text-sm text-gray-400 leading-relaxed">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  Data-handling summary updated: {PRIVACY_NOTICE_VERSION}
                </p>
                <p>
                  This summary describes app data handling. Use the published privacy notice for the operator identity, lawful bases, retention periods, service providers, international transfers and complaints process. Contact privacy support for clarification or to exercise your rights.
                </p>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">1. Information We Process</h3>
                  <p>
                    Account information may include your email address, display name, profile image, authentication provider and Firebase user identifier. Calculations may be stored locally on your device and, when signed in, in your private account history.
                    Projects can contain client names, site addresses, contact details, job photographs, notes, quotes, invoices, payments and your business profile, logo and optional bank details. Avoid unnecessary sensitive information or access codes.
                    RAMS documents and templates may also contain site risk assessments, method statements, preparer/reviewer details and optional named briefing acknowledgements and signature images. Only record signatures with authorisation; retain and share them only where necessary.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">2. How Information Is Used</h3>
                  <p>
                    Information is used to authenticate you, provide account and history features, restore Pro access, respond to support requests, maintain security, and operate and improve the toolkit.
                    Your business normally controls its client records; the app hosts those records on your instructions. You are responsible for having an appropriate lawful basis and providing privacy information to your clients. The regulatory update lookup does not need client records or job photographs.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">3. Purchases</h3>
                  <p>
                    Native subscriptions are processed by Apple App Store or Google Play. Web payments may be processed by Stripe. We do not receive or store your full payment card details. Store transaction identifiers and entitlement status may be used to provide Pro access.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">4. Service Providers</h3>
                  <p>
                    The app uses Firebase for authentication and cloud data, Apple and Google for platform services and purchases, Stripe for supported web payments, and a hosted update service for checking published BS 7671 amendment information.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">5. Retention and Deletion</h3>
                  <p>
                    Settings lets you export private account records, clear device copies and submit an account-deletion request. Requests are reviewed before erasure, including any legal requirement to retain financial records. A request is not confirmation of completed deletion. Device copies and previously shared or downloaded files need separate attention. Deleting an account does not cancel a store or web subscription.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">6. Security and Your Rights</h3>
                  <p>
                    Reasonable technical safeguards are used, but no online service can guarantee absolute security. Depending on your location, you may request access, correction or deletion of personal information by contacting support.
                    Downloaded project and invoice records can remain available offline on this device. Protect the device with a screen lock and avoid shared devices. Current offline caches do not provide additional app-level encryption. Internal backups may contain client details, bank details and private costs: do not send them as client documents.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">7. Children and Changes</h3>
                  <p>
                    The toolkit is intended for electrical professionals, trainees and adult users, and is not directed to children under 13. Material policy changes will be reflected by updating this page and its effective date.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">8. Contact</h3>
                  <p>
                    Privacy requests and complaints can be sent to <a href={PRIVACY_CONTACT_URL} className="text-emerald-500 underline">{PRIVACY_CONTACT_EMAIL}</a>. Do not email passwords, purchase tokens, bank details or entire client databases. We will arrange proportionate identity verification and a secure transfer where needed.
                  </p>
                </section>

                <div className="pt-4 border-t border-white/5">
                  <button
                    onClick={() => void openExternalUrl(PRIVACY_POLICY_URL)}
                    className="text-emerald-500 font-bold uppercase text-[10px] tracking-widest hover:underline"
                  >
                    Open Policy in Browser
                  </button>
                </div>
              </div>
            </motion.div>
          ) : mode === AppMode.TERMS ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1">Terms of Service</h2>
              </div>

              <div className="bg-hardware-card p-5 sm:p-6 rounded-3xl border border-hardware-border space-y-5 text-sm text-gray-400 leading-relaxed">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  Last updated: 15 June 2026
                </p>
                <p>
                  By using The Sparkys Mate, you agree to these terms. If you do not agree, do not use the app.
                </p>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">1. Engineering Guidance</h3>
                  <p>
                    The toolkit provides calculation assistance and general guidance. It does not replace BS 7671, manufacturer instructions, site inspection, professional judgement or verification by a suitably qualified person. You remain responsible for every design and installation decision.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">2. Accounts</h3>
                  <p>
                    You are responsible for maintaining the security of your sign-in credentials and for activity performed through your account. Information supplied when creating an account must be accurate and lawful.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">3. Subscriptions</h3>
                  <p>
                    Pro subscriptions, free trials, renewals, cancellations and refunds are administered by the store or payment provider used for purchase. Subscriptions renew automatically unless cancelled through the relevant account settings before renewal. Prices and trial availability are displayed before purchase.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">4. Acceptable Use</h3>
                  <p>
                    You must not misuse the service, attempt unauthorised access, interfere with its operation, reverse engineer protected services, submit unlawful content, or use the toolkit in a way that risks harm to people or property.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">5. Intellectual Property</h3>
                  <p>
                    The app, its interface, original content and software are protected by applicable intellectual property law. References to BS 7671, IET, BSI, Apple, Google and other third parties remain the property of their respective owners.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">6. Availability and Updates</h3>
                  <p>
                    Features may change as standards, platforms and services evolve. We aim to keep the app available and current but do not guarantee uninterrupted operation or that external regulatory information will always be immediately available.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">7. Liability</h3>
                  <p>
                    To the extent permitted by law, the app is provided without guarantees beyond those that cannot legally be excluded. We are not responsible for losses arising from reliance on unverified calculations, incorrect inputs, site conditions or use contrary to professional requirements.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">8. Termination and Changes</h3>
                  <p>
                    Access may be restricted for serious misuse. You may stop using the service or delete your account at any time. Updated terms take effect when published in the app with a revised date.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">9. Contact</h3>
                  <p>
                    Questions about these terms can be sent to <a href={SUPPORT_EMAIL} className="text-emerald-500 underline">tommyholm@hotmail.co.uk</a>.
                  </p>
                </section>

                <div className="pt-4 border-t border-white/5">
                  <button
                    onClick={() => void openExternalUrl(TERMS_OF_SERVICE_URL)}
                    className="text-emerald-500 font-bold uppercase text-[10px] tracking-widest hover:underline"
                  >
                    Open Terms in Browser
                  </button>
                </div>
              </div>
            </motion.div>
          ) : mode === AppMode.ACCOUNT_DELETION ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1">Account Deletion</h2>
              </div>

              <div className="bg-hardware-card p-6 rounded-3xl border border-hardware-border space-y-6">
                <div className="flex items-center gap-4 text-orange-500">
                  <AlertTriangle size={32} />
                  <div>
                    <h3 className="font-bold text-white">Request Data Deletion</h3>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">Permanent Action</p>
                  </div>
                </div>

                <div className="space-y-4 text-sm text-gray-400 leading-relaxed">
                  <p>
                    Request account deletion in Settings or contact privacy support. The request is reviewed before erasure, and support must explain any records that must lawfully be retained.
                  </p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>Export private records and original PDFs before deletion is processed.</li>
                    <li>Cancel subscriptions separately with Apple, Google Play or the original web billing provider.</li>
                    <li>Completed erasure cannot be undone. Remove device copies and previously exported files separately.</li>
                  </ul>
                </div>

                {user ? (
                  <button
                    onClick={() => setShowSettingsModal(true)}
                    className="w-full bg-red-500/10 text-red-500 py-4 rounded-2xl font-bold uppercase tracking-widest text-[10px] border border-red-500/20 hover:bg-red-500/20 transition-all"
                  >
                    Go to Settings to Delete
                  </button>
                ) : (
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Manual Request</p>
                    <p className="text-sm text-white">Contact <a href={PRIVACY_CONTACT_URL} className="text-emerald-500 underline">{PRIVACY_CONTACT_EMAIL}</a> to request deletion. Do not send passwords or client records; support will verify the request securely.</p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : mode === AppMode.SUPPORT ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1">Support & Contact</h2>
              </div>

              <div className="bg-hardware-card p-6 rounded-3xl border border-hardware-border space-y-6">
                <div className="flex items-center gap-4 text-emerald-500">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                    <Mail size={32} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Direct Support</h3>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">Fast response for Pro users</p>
                  </div>
                </div>

                <div className="space-y-4 text-sm text-gray-400 leading-relaxed">
                  <p>
                    Need help with a calculation, found a bug, or have a feature request? We're here to help.
                  </p>
                  <p>
                    For technical support or billing enquiries, please use the button below to email our lead developer directly.
                  </p>
                </div>

                <a
                  href={SUPPORT_EMAIL}
                  className="w-full bg-emerald-500 text-black py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <Mail size={16} />
                  Email Support
                </a>

                <div className="pt-4 border-t border-white/5 text-center">
                  <p className="text-[10px] text-gray-600 uppercase font-bold tracking-widest" id="support-response-time">
                    Response time: Usually within 24 hours
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
                <div className="flex items-center gap-3 mb-2">
                  <button onClick={goBack} aria-label="Back" className="text-gray-500 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                  </button>
                  <h2 className="text-xl font-bold flex-1">
                    {mode === AppMode.VOLTAGE_DROP && 'AC Voltage Drop'}
                    {mode === AppMode.CABLE_FINDER && 'Cable Size Finder'}
                  </h2>
                  {!showResults && (
                    <button
                      onClick={() => {
                        setLoadKw('');
                        setLengthM('');
                        setCableOptions({ operatingTemperature:70, cpcArrangement:'separate', autoSizeSeparateCpc:true });
                        setTargetCurrent('');
                      }}
                      className="text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-red-500 transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>

              <SourceNotes ids={sourceIds} />
              {selectionIssue && <p role="alert" className="text-xs text-red-400 break-words">{selectionIssue}</p>}

              {!showResults ? (
                <div className="space-y-6">
                  {/* Inputs based on mode */}
                  <div className="grid gap-4">
                    {mode === AppMode.VOLTAGE_DROP && (
                      <div className="bg-hardware-card p-5 rounded-3xl border border-hardware-border">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-3 tracking-widest">Load (kW)</label>
                        <div className="flex items-center gap-4">
                          <Zap size={24} className="text-emerald-500" />
                          <input
                            type="number"
                            inputMode="decimal"
                            autoFocus
                            value={loadKw}
                            onChange={(e) => setLoadKw(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCalculate()}
                            placeholder="0.0"
                            className="bg-transparent w-full text-3xl font-mono font-bold focus:outline-none placeholder:text-gray-800"
                          />
                        </div>
                      </div>
                    )}

                    {mode === AppMode.VOLTAGE_DROP && (
                      <div className="bg-hardware-card p-5 rounded-3xl border border-hardware-border">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-3 tracking-widest">Length (m)</label>
                        <div className="flex items-center gap-4">
                          <Ruler size={24} className="text-blue-500" />
                          <input
                            type="number"
                            inputMode="decimal"
                            value={lengthM}
                            onChange={(e) => setLengthM(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCalculate()}
                            placeholder="0"
                            className="bg-transparent w-full text-3xl font-mono font-bold focus:outline-none placeholder:text-gray-800"
                          />
                        </div>
                      </div>
                    )}

                    {mode === AppMode.CABLE_FINDER && (
                      <div className="bg-hardware-card p-5 rounded-3xl border border-hardware-border">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-3 tracking-widest">Target Current (A)</label>
                        <div className="flex items-center gap-4">
                          <Activity size={24} className="text-purple-500" />
                          <input
                            type="number"
                            inputMode="decimal"
                            autoFocus
                            value={targetCurrent}
                            onChange={(e) => setTargetCurrent(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCalculate()}
                            placeholder="0"
                            className="bg-transparent w-full text-3xl font-mono font-bold focus:outline-none placeholder:text-gray-800"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Config based on mode */}
                  {(mode === AppMode.VOLTAGE_DROP || mode === AppMode.CABLE_FINDER) && (
                    <div className="space-y-4">
                      {mode === AppMode.VOLTAGE_DROP && (
                        <>
                          <div>
                            <span className="block text-[10px] font-bold text-gray-500 uppercase mb-3 ml-1 tracking-widest">Circuit Type</span>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.values(CircuitType).map((type) => (
                                <button
                                  key={type}
                                  onClick={() => setCircuitType(type)}
                                  className={`py-4 px-4 rounded-2xl text-xs font-bold transition-all border ${
                                    circuitType === type
                                      ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20'
                                      : 'bg-[#1a1a1a] text-gray-400 border-white/5 hover:border-white/20'
                                  }`}
                                >
                                  {type.split(' (')[0]}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span className="block text-[10px] font-bold text-gray-500 uppercase mb-3 ml-1 tracking-widest">Supply Type</span>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.values(SupplyType).map((type) => (
                                <button
                                  key={type}
                                  onClick={() => setSupplyType(type)}
                                  className={`py-4 px-4 rounded-2xl text-xs font-bold transition-all border ${
                                    supplyType === type
                                      ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20'
                                      : 'bg-[#1a1a1a] text-gray-400 border-white/5 hover:border-white/20'
                                  }`}
                                >
                                  {type.split(' (')[0]}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {/* Cable Core Type */}
                      <div className="space-y-6">
                        <div>
                          <span className="block text-[10px] font-bold text-gray-500 uppercase mb-3 ml-1 tracking-widest">Cable Core Type</span>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.values(CableCoreType).map((type) => (
                              <button
                                key={type}
                                onClick={() => { setCableCoreType(type); setCableType(type === CableCoreType.SINGLE_CORE ? CableType.PVC_SINGLE : CableType.PVC_PVC); }}
                                className={`py-4 px-4 rounded-2xl text-xs font-bold transition-all border ${
                                  cableCoreType === type
                                    ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20'
                                    : 'bg-[#1a1a1a] text-gray-400 border-white/5 hover:border-white/20'
                                }`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="block text-[10px] font-bold text-gray-500 uppercase mb-3 ml-1 tracking-widest">Cable Type (BS 7671)</span>
                          <div className="grid grid-cols-1 gap-2">
                            {Object.values(CableType).map((type) => (
                              <button
                                key={type}
                                disabled={(cableCoreType === CableCoreType.SINGLE_CORE) !== (type === CableType.PVC_SINGLE)}
                                title={(cableCoreType === CableCoreType.SINGLE_CORE) !== (type === CableType.PVC_SINGLE) ? 'Choose the matching core construction first.' : undefined}
                                onClick={() => setCableType(type)}
                                className={`py-4 px-4 rounded-2xl text-xs font-bold text-left transition-all border ${
                                  cableType === type
                                    ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20'
                                    : 'bg-[#1a1a1a] text-gray-400 border-white/5 hover:border-white/20'
                                }`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(mode === AppMode.CABLE_FINDER || mode === AppMode.VOLTAGE_DROP) && (
                    <div>
                      <div className="flex items-center justify-between mb-3 ml-1">
                        <span className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">Installation Method</span>
                        <button
                          onClick={() => setShowMethodInfo(true)}
                          className="text-emerald-500 p-1 hover:bg-emerald-500/10 rounded-full transition-colors"
                        >
                          <Info size={16} />
                        </button>
                      </div>
                      <div className="grid gap-2 max-h-[240px] overflow-y-auto pr-1 custom-scrollbar">
                        {allMethods.filter(entry => !getInstallationIssue(cableType, entry.id)).map((entry) => {
                          const m = entry.id;
                          return (
                          <button
                            key={m}
                            aria-pressed={method === m}
                            onClick={() => setMethod(m)}
                            className={`w-full min-w-0 py-4 px-4 rounded-2xl text-xs font-bold text-left transition-all border flex items-start justify-between gap-3 ${
                              method === m
                                ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20'
                                : 'bg-hardware-card text-gray-400 border-hardware-border hover:border-white/20'
                            }`}
                          >
                            <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{entry.label}</span>
                            {method === m && <CheckCircle2 size={16} className="shrink-0" />}
                          </button>
                        ); })}
                      </div>
                    </div>
                  )}

                  {mode === AppMode.CABLE_FINDER && <label className="block text-xs text-gray-400">Supply Phase
                    <select aria-label="Supply Phase" value={supplyType} onChange={e => setSupplyType(e.target.value as SupplyType)} className="w-full min-w-0 bg-black/40 border border-hardware-border rounded-2xl p-4 text-white">
                      {Object.values(SupplyType).map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>}
                  <CableDesignControls cable={cableType} value={cableOptions} onChange={setCableOptions} temperatureOnly={mode === AppMode.CABLE_FINDER} />
                  <button
                    onClick={handleCalculate}
                    className="w-full bg-emerald-500 text-white py-5 rounded-3xl font-bold text-lg shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    Recalculate
                    <ChevronRight size={20} />
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Results Display */}
                  {((mode === AppMode.CABLE_FINDER && !cableFinderResult) || (mode === AppMode.VOLTAGE_DROP && !result)) && <p role="alert" className="text-xs text-red-400 break-words">{selectionIssue || 'No recorded cable/device combination satisfies these inputs. Check the load, length, device rating and available source data; no replacement row has been selected.'}</p>}
                  {mode === AppMode.CABLE_FINDER && cableFinderResult && (
                    <div className="bg-hardware-card p-6 sm:p-8 rounded-[32px] border border-hardware-border text-center relative overflow-hidden">
                      <div className="dashed-ring absolute inset-0 pointer-events-none opacity-50" />
                      <span className="block text-[10px] font-bold text-gray-500 uppercase mb-4 tracking-widest relative z-10">Recommended Size</span>
                      <p className="text-xs text-gray-400 relative z-10">{cableFinderResult.ratingTable}, column {cableFinderResult.capacityColumn}; {cableFinderResult.loadedConductors} loaded conductors, {cableFinderResult.operatingTemperature}C. Capacity only; CPC and fault protection not assessed.</p>
                      <div className="flex items-baseline justify-center gap-2 relative z-10">
                        <span className="text-7xl font-mono font-bold tracking-tighter">{cableFinderResult.size}</span>
                        <span className="text-2xl font-bold text-purple-500">mm²</span>
                      </div>
                      <div className="mt-8 p-4 bg-white/5 rounded-2xl text-left space-y-2 relative z-10">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                          <span className="text-gray-500">Method Capacity</span>
                          <span className="text-white">{cableFinderResult.capacity[method]}A</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                          <span className="text-gray-500">mV/A/m</span>
                          <span className="text-white">{cableFinderResult.mvAm}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {mode === AppMode.VOLTAGE_DROP && result && (
                    <div className="space-y-4">
                      {/* Share Button */}
                      <div className="flex justify-end">
                        <button
                          onClick={() => setShowShareMenu(true)}
                          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-500 hover:bg-emerald-500/10 px-4 py-2 rounded-full transition-colors"
                        >
                          <Share2 size={14} />
                          Share Result
                        </button>
                      </div>

                      {/* Compliance Banner */}
                      <div className={`p-4 sm:p-6 rounded-[28px] flex items-center gap-4 border ${result.isCompliant ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${result.isCompliant ? 'bg-emerald-500' : 'bg-red-500'} text-white shadow-lg hardware-glow`}>
                          {result.isCompliant ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
                        </div>
                        <div>
                          <h3 className="font-bold text-lg leading-tight uppercase tracking-tight">
                            {result.isCompliant ? 'Checks Pass' : 'Checks Fail'}
                          </h3>
                          <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                            {result.isCompliant ? 'Recorded design checks only' : 'Review the selected constraints'}
                          </p>
                        </div>
                      </div>

                      <div className="bg-emerald-500 p-6 sm:p-8 rounded-[32px] text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden hardware-glow">
                        <div className="relative z-10">
                          <span className="block text-[10px] font-bold text-white/50 uppercase mb-2 tracking-widest">Cable Size</span>
                          <div className="flex items-baseline gap-2">
                            <span className="text-5xl sm:text-6xl font-mono font-bold tracking-tighter">{result.cableSize}</span>
                            <span className="text-xl font-bold opacity-50">mm²</span>
                          </div>
                          <p className="text-sm mt-2">{result.cpcSize} mm2 {result.cpcArrangement === 'integral' ? 'integral copper CPC' : 'separate copper CPC'}</p>
                        </div>
                        <Zap className="absolute -right-6 -bottom-6 text-white/10 w-40 h-40 rotate-12" />
                      </div>

                      <div className="bg-hardware-card rounded-[32px] border border-hardware-border overflow-hidden">
                        <div className="p-6 space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-gray-400">Voltage Drop</span>
                            <div className="result-field min-w-0 text-right">
                              <span className="font-mono font-bold text-xl">{result.voltageDrop.toFixed(2)}V</span>
                              <span className={`inline-block ml-2 mt-1 text-[10px] font-bold px-2 py-1 rounded-lg ${result.isCompliant ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {result.voltageDropPercentage.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min((result.voltageDropPercentage / result.limitPercentage) * 100, 100)}%` }}
                              className={`h-full ${result.isCompliant ? 'bg-emerald-500' : 'bg-red-500'}`}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] font-bold uppercase text-gray-500 tracking-widest">
                            <span>0%</span>
                            <span>Limit: {result.limitPercentage}%</span>
                          </div>
                        </div>
                      </div>

                      {result.zs !== undefined && (
                        <div className="bg-hardware-card rounded-[32px] border border-hardware-border overflow-hidden">
                          <div className="p-6 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-gray-400">Earth Loop (Zs)</span>
                              <div className="result-field min-w-0 text-right">
                                <span className="font-mono font-bold text-xl">{result.zs.toFixed(2)}Ω</span>
                                <span className={`inline-block ml-2 mt-1 text-[10px] font-bold px-2 py-1 rounded-lg ${result.zsCompliant ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                  Max: {result.maxZs?.toFixed(2)}Ω
                                </span>
                              </div>
                            </div>
                            <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min((result.zs / (result.maxZs || 1)) * 100, 100)}%` }}
                                className={`h-full ${result.zsCompliant ? 'bg-emerald-500' : 'bg-red-500'}`}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] font-bold uppercase text-gray-500 tracking-widest">
                              <span>0Ω</span>
                              <span>Limit: {result.maxZs?.toFixed(2)}Ω</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <RecalculateButton inputKey={JSON.stringify(currentHistoryPayload?.inputs)} message={mode === AppMode.CABLE_FINDER ? cableFinderResult ? 'Recalculated capacity recommendation. CPC and fault protection are not assessed by Cable Finder.' : 'No supported capacity row for these inputs.' : result?.isCompliant ? 'Recalculated: recorded checks pass.' : 'No passing design within the selected constraints.'} onRecalculate={handleCalculate} />
                  <div className="flex gap-4">
                    <button
                      onClick={() => setShowResults(false)}
                      className="flex-1 bg-white/5 border border-white/10 py-5 rounded-3xl font-bold text-gray-400 hover:bg-white/10 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={handleSaveHistory}
                      disabled={isSavingHistory}
                      className={saveHistoryButtonClass}
                    >
                      {historySaveStatus === 'saving' ? (
                        <div className="w-[18px] h-[18px] border-2 border-current/25 border-t-current rounded-full animate-spin" />
                      ) : historySaveStatus === 'saved' ? (
                        <Check size={18} />
                      ) : historySaveStatus === 'error' ? (
                        <AlertTriangle size={18} />
                      ) : (
                        <HistoryIcon size={18} />
                      )}
                      {saveHistoryButtonLabel}
                    </button>
                  </div>

                  <div className="p-6 bg-orange-500/5 border border-orange-500/10 rounded-3xl">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-gray-500 leading-relaxed">
                        <span className="font-bold text-orange-500 uppercase tracking-widest block mb-1">Disclaimer</span>
                        This tool is for guidance only. All designs must be verified against {regulatoryInfo.version} {regulatoryInfo.amendment} and site conditions by a qualified electrician.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <SaveToProject key={user?.uid || 'guest'} mode={mode} hasBusiness={effectiveIsBusiness} onUpgrade={()=>openUpgrade('business')} onSignIn={() => setShowLoginModal(true)} />
        <CalculatorDocument />
      </main>

      {/* Navigation Bar (Mobile Style) */}
      {!cleanMode && (
        <nav className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/80 backdrop-blur-xl border-t border-white/5 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] z-20">
          <div className="max-w-xl mx-auto flex justify-around items-center [&>button]:min-h-11 [&>button]:min-w-11 [&>button]:flex-1">
            <button onClick={goHome} className={`flex flex-col items-center gap-1 ${mode === AppMode.HOME ? 'text-emerald-500' : 'text-gray-500'}`}>
              <LayoutGrid size={20} />
              <span className="text-[10px] font-bold uppercase">Home</span>
            </button>
            <button onClick={() => handleModeChange(AppMode.DESIGN)} className={`flex flex-col items-center gap-1 ${mode === AppMode.DESIGN || (TOOL_MODES.includes(mode) && mode !== AppMode.CABLE_FINDER) ? 'text-emerald-500' : 'text-gray-500'}`}>
              <Calculator size={20} />
              <span className="text-[10px] font-bold uppercase">Design</span>
            </button>
            <button onClick={() => handleModeChange(AppMode.CABLE_FINDER)} className={`flex flex-col items-center gap-1 ${mode === AppMode.CABLE_FINDER ? 'text-emerald-500' : 'text-gray-500'}`}>
              <Search size={20} />
              <span className="text-[10px] font-bold uppercase">Finder</span>
            </button>
            <button onClick={() => handleModeChange(AppMode.HISTORY)} className={`flex flex-col items-center gap-1 ${mode === AppMode.HISTORY ? 'text-emerald-500' : 'text-gray-500'}`}>
              <HistoryIcon size={20} />
              <span className="text-[10px] font-bold uppercase">History</span>
            </button>
            <button onClick={() => handleModeChange(AppMode.PROJECTS)} className={`flex flex-col items-center justify-center min-h-11 min-w-11 gap-1 ${mode === AppMode.PROJECTS ? 'text-emerald-500' : 'text-gray-500'}`}>
              <FolderOpen size={20} />
              <span className="text-[10px] font-bold uppercase">Projects</span>
            </button>
          </div>
        </nav>
      )}

      <AnimatePresence>
        {showTextShareMenu && (
          <ModalSheet
            onClose={() => setShowTextShareMenu(false)}
            ariaLabel="Export calculation"
            zIndexClass="z-50"
            panelClassName="p-5 sm:p-6"
          >
              <div className="flex items-center justify-between mb-5 sm:mb-6">
                <h3 className="text-xl font-bold">Export Calculation</h3>
                <button onClick={() => setShowTextShareMenu(false)} className="p-2 bg-white/5 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={handleNativeShareText}
                  className="flex flex-col items-center gap-3 p-4 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors group"
                >
                  <div className="w-11 h-11 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                    <Share2 size={22} />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Share</span>
                </button>

                <button
                  onClick={handleCopySharedText}
                  className="flex flex-col items-center gap-3 p-4 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors group"
                >
                  <div className="w-11 h-11 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                    {isCopying ? <Check size={22} /> : <Copy size={22} />}
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
                    {isCopying ? 'Copied' : 'Copy'}
                  </span>
                </button>

                <button
                  onClick={handleDownloadSharedTextPDF}
                  disabled={isSavingTextPDF}
                  className="flex flex-col items-center gap-3 p-4 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors group disabled:opacity-50"
                >
                  <div className="w-11 h-11 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
                    {isSavingTextPDF ? <Check size={22} /> : <FileText size={22} />}
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
                    {isSavingTextPDF ? 'Saved' : 'PDF'}
                  </span>
                </button>
              </div>

              <div className="mt-5 pt-5 border-t border-white/5">
                <p className="text-[10px] text-gray-500 text-center uppercase font-bold tracking-widest mb-4">Preview</p>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-black/30 border border-white/5 p-4 text-[10px] leading-relaxed text-gray-300 font-mono">
                  {sharedText}
                </pre>
              </div>
          </ModalSheet>
        )}

        {showShareMenu && (
          <ModalSheet
            onClose={() => setShowShareMenu(false)}
            ariaLabel="Export summary"
            maxWidthClass="max-w-lg"
            zIndexClass="z-50"
            panelClassName="p-5 sm:p-6"
          >
              <div className="flex items-center justify-between mb-5 sm:mb-6">
                <h3 className="text-xl font-bold">Export Summary</h3>
                <button onClick={() => setShowShareMenu(false)} className="p-2 bg-white/5 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <button
                  onClick={handleShareText}
                  className="flex flex-col items-center gap-2 p-3 sm:p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors group"
                >
                  <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                    {isCopying ? <Check size={24} /> : <Copy size={24} />}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {isCopying ? 'Copied' : 'Copy Text'}
                  </span>
                </button>

                <button
                  onClick={handleDownloadImage}
                  disabled={isSavingImage}
                  className="flex flex-col items-center gap-2 p-3 sm:p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors group disabled:opacity-50"
                >
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                    {isSavingImage ? <Check size={24} /> : <Download size={24} />}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {isSavingImage ? 'Saved' : 'Save Image'}
                  </span>
                </button>

                <button
                  onClick={handleDownloadPDF}
                  disabled={isSavingPDF}
                  className="flex flex-col items-center gap-2 p-3 sm:p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors group disabled:opacity-50"
                >
                  <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
                    {isSavingPDF ? <Check size={24} /> : <FileText size={24} />}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {isSavingPDF ? 'Saved' : 'Save PDF'}
                  </span>
                </button>
              </div>

              <div className="mt-5 pt-5 border-t border-white/5">
                <p className="text-[10px] text-gray-500 text-center uppercase font-bold tracking-widest">Preview</p>
                <div className="mt-3 p-2 bg-hardware-bg rounded-2xl border border-hardware-border">
                  <div ref={shareRef} className="p-4 bg-hardware-bg text-white font-sans">
                    <SourceNotes ids={sourceIds} expanded assumptions={result?.assumptions} />
                    <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-3">
                      <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white">
                        <Cpu size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm">Circuit Summary</h4>
                        <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">The Sparkys Mate • {regulatoryInfo.version}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="result-field">
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Load</span>
                        <span className="text-sm font-mono font-bold">{loadKw} kW</span>
                      </div>
                      <div className="result-field">
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Length</span>
                        <span className="text-sm font-mono font-bold">{lengthM} m</span>
                      </div>
                      <div className="result-field">
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Cable Type</span>
                        <span className="result-field-value text-xs sm:text-sm font-mono font-bold uppercase block">{cableType}</span>
                      </div>
                      <div className="result-field">
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Core Type</span>
                        <span className="result-field-value text-xs sm:text-sm font-mono font-bold uppercase">{cableCoreType}</span>
                      </div>
                      <div className="result-field">
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Cable Size</span>
                        <span className="text-sm font-mono font-bold text-emerald-500">{result?.cableSize} mm²</span>
                      </div>
                      <div className="result-field">
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Device</span>
                        <span className="result-field-value text-xs sm:text-sm font-mono font-bold">{result?.protectiveDevice} A ({deviceType})</span>
                      </div>
                      <div className="result-field">
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">V-Drop</span>
                        <span className="result-field-value text-xs sm:text-sm font-mono font-bold">{result?.voltageDrop.toFixed(2)}V ({result?.voltageDropPercentage.toFixed(1)}%)</span>
                      </div>
                      <div className="result-field">
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Zs Value</span>
                        <span className="text-sm font-mono font-bold">{result?.zs?.toFixed(2)} Ω</span>
                      </div>
                      <div className="result-field">
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Status</span>
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${result?.isCompliant ? 'text-emerald-500' : 'text-red-500'}`}>
                          {result?.isCompliant ? 'Compliant' : 'Non-Compliant'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-8 pt-4 border-t border-white/10 flex justify-between items-center">
                      <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">
                        {new Date().toLocaleDateString()}
                      </span>
                      <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">
                        Calculated via The Sparkys Mate
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hidden PDF Report (White Background) */}
              <div aria-hidden="true" className="fixed -left-[9999px] top-0">
                <div ref={pdfRef} className="w-[400px] p-10 bg-white text-black font-sans border border-gray-200">
                  <SourceNotes ids={sourceIds} expanded assumptions={result?.assumptions} />
                  <div className="flex items-center gap-4 mb-8 border-b border-gray-100 pb-6">
                    <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
                      <Cpu size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-xl text-gray-900">Electrical Circuit Report</h4>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">The Sparkys Mate • {regulatoryInfo.version}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-y-6">
                    <div className="grid grid-cols-2 gap-4 border-b border-gray-50 pb-4">
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Load</span>
                        <span className="text-lg font-mono font-bold text-gray-900">{loadKw} kW</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Length</span>
                        <span className="text-lg font-mono font-bold text-gray-900">{lengthM} m</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-b border-gray-50 pb-4">
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cable Type</span>
                        <span className="text-sm font-mono font-bold text-gray-900 uppercase">{cableType}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Core Type</span>
                        <span className="text-sm font-mono font-bold text-gray-900 uppercase">{cableCoreType}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-b border-gray-50 pb-4">
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cable Size</span>
                        <span className="text-lg font-mono font-bold text-emerald-600">{result?.cableSize} mm²</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Device</span>
                        <span className="text-lg font-mono font-bold text-gray-900">{result?.protectiveDevice} A ({deviceType})</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-b border-gray-50 pb-4">
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Voltage Drop</span>
                        <span className="text-lg font-mono font-bold text-gray-900">{result?.voltageDrop.toFixed(2)}V ({result?.voltageDropPercentage.toFixed(1)}%)</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Zs Value</span>
                        <span className="text-lg font-mono font-bold text-gray-900">{result?.zs?.toFixed(2)} Ω</span>
                      </div>
                    </div>

                    <div className="pt-4">
                      <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Compliance Status</span>
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest ${
                        result?.isCompliant ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                      }`}>
                        {result?.isCompliant ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                        {result?.isCompliant ? 'Compliant' : 'Non-Compliant'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-12 pt-6 border-t border-gray-100 flex justify-between items-center text-gray-400">
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      Report Date: {new Date().toLocaleDateString()}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      The Sparkys Mate Professional
                    </span>
                  </div>
                </div>
              </div>
          </ModalSheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMethodInfo && (
          <div className="safe-modal-shell fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMethodInfo(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="safe-modal-panel relative w-full max-w-md bg-hardware-card border border-hardware-border rounded-t-[32px] sm:rounded-[32px] p-5 sm:p-7 overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold">Installation Methods</h3>
                <button onClick={() => setShowMethodInfo(false)} className="p-2 bg-white/5 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-6 text-sm">
                <SourceNotes ids={['installations']} />
                {INSTALLATION_ENTRIES.map(entry => <div key={entry.id}>
                  <h4 className="font-bold text-emerald-500 mb-2 uppercase tracking-widest text-[10px]">{entry.kind === 'reference-method' ? `Reference method ${entry.referenceMethodCode}` : `Installation ${entry.installationNumber}`}</h4>
                  <p className="text-gray-400">{entry.label}</p>
                  <p className="text-gray-500 text-xs">{getCombinationIssue(cableType, entry.id) || 'Legacy description and rating-column applicability are not source-verified.'}</p>
                </div>)}
              </div>
              <button
                onClick={() => setShowMethodInfo(false)}
                className="w-full mt-8 bg-emerald-500 text-white py-4 rounded-2xl font-bold"
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}

        {showSettingsModal && (
          <div className="safe-modal-shell fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettingsModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="safe-modal-panel relative w-full max-w-md bg-hardware-card border border-white/10 rounded-t-[32px] sm:rounded-[32px] p-5 sm:p-7 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-bold">Settings</h3>
                <button onClick={() => setShowSettingsModal(false)} className="text-gray-500 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                {user && (
                  <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
                        <UserIcon size={24} className="text-gray-400" />
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-white">{user.displayName || "User"}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">Display Options</p>
                  <button onClick={()=>{setShowSettingsModal(false);openUpgrade(effectiveIsBusiness?'business':'pro');}} className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center justify-between transition-colors group">
                    <span className="flex items-center gap-3"><Crown size={18} className="text-emerald-500"/><span className="text-sm font-medium">Manage Subscription</span></span><ChevronRight size={16} className="text-gray-500"/>
                  </button>
                  {user && <button onClick={manageExistingWebSubscription} className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center justify-between"><span className="text-sm">Manage Existing Web Subscription</span><ChevronRight size={16}/></button>}
                  <button
                    onClick={() => {
                      setCleanMode(true);
                      setShowSettingsModal(false);
                    }}
                    className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <EyeOff size={18} className="text-gray-400 group-hover:text-emerald-500 transition-colors" />
                      <span className="text-sm font-medium">Clean Screenshot Mode</span>
                    </div>
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                  </button>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1 mt-4">Developer Controls</p>
                  {!hasApiKey && (
                    <button
                      onClick={handleSelectKey}
                      className="w-full p-4 bg-orange-500/10 hover:bg-orange-500/20 rounded-2xl text-left flex items-center justify-between transition-colors group border border-orange-500/20"
                    >
                      <span className="text-sm font-medium text-orange-500">Setup Gemini API Key</span>
                      <ChevronRight size={16} className="text-orange-500" />
                    </button>
                  )}
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1 mt-4">Legal & Support</p>
                  <button disabled={privacyBusy} onClick={() => void handlePrivacyAction('export')} className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center gap-3 disabled:opacity-50">
                    <Download size={18} /><span className="text-sm font-medium">Export Private Account Records</span>
                  </button>
                  <button disabled={privacyBusy} onClick={() => void handlePrivacyAction('clear')} className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center gap-3 disabled:opacity-50">
                    <Shield size={18} /><span className="text-sm font-medium">Clear This Account's Device Copies</span>
                  </button>
                  <button onClick={() => void openExternalUrl(PRIVACY_REQUEST_URL || PRIVACY_CONTACT_URL)} className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center gap-3">
                    <Mail size={18} /><span className="text-sm font-medium">Privacy Request or Complaint</span>
                  </button>
                  {(privacyBusy || privacyMessage) && <p role="status" className="text-xs text-gray-400 break-words">{privacyBusy ? 'Working...' : privacyMessage}</p>}
                  {DATA_PROCESSING_TERMS_URL && <button onClick={() => void openExternalUrl(DATA_PROCESSING_TERMS_URL)} className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center gap-3">
                    <FileText size={18} /><span className="text-sm font-medium">Business Data Processing Terms</span>
                  </button>}
                  <button
                    onClick={() => {
                      setMode(AppMode.PRIVACY);
                      setShowSettingsModal(false);
                    }}
                    className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center justify-between transition-colors group"
                  >
                    <span className="text-sm font-medium">Privacy Policy (In-App)</span>
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                  </button>
                  <button
                    onClick={() => void openExternalUrl(PRIVACY_POLICY_URL)}
                    className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center justify-between transition-colors group"
                  >
                    <span className="text-sm font-medium">Privacy Policy (External)</span>
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                  </button>
                  <button
                    onClick={() => {
                      setMode(AppMode.ACCOUNT_DELETION);
                      setShowSettingsModal(false);
                    }}
                    className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center justify-between transition-colors group"
                  >
                    <span className="text-sm font-medium">Account Deletion Info</span>
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                  </button>
                  <button
                    onClick={() => {
                      setMode(AppMode.TERMS);
                      setShowSettingsModal(false);
                    }}
                    className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center justify-between transition-colors group"
                  >
                    <span className="text-sm font-medium">Terms of Service</span>
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                  </button>
                  <button
                    onClick={() => {
                      setMode(AppMode.SUPPORT);
                      setShowSettingsModal(false);
                    }}
                    className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center justify-between transition-colors group"
                  >
                    <span className="text-sm font-medium">Support & Contact</span>
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">Account Actions</p>
                  <button
                    id="logout-button"
                    onClick={() => {
                      handleLogout();
                      setShowSettingsModal(false);
                    }}
                    className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center gap-3 text-white transition-colors"
                  >
                    <LogOut size={18} className="text-gray-400" />
                    <span className="text-sm font-medium">Log Out</span>
                  </button>

                  {!showDeleteConfirm ? (
                    <button
                      id="delete-account-trigger"
                      onClick={() => {
                        setDeletePassword('');
                        setDeleteError(null);
                        setDeleteSuccess(false);
                        setShowDeleteConfirm(true);
                      }}
                      className="w-full p-4 bg-red-500/10 hover:bg-red-500/20 rounded-2xl text-left flex items-center gap-3 text-red-500 transition-colors"
                    >
                      <AlertTriangle size={18} />
                      <span className="text-sm font-medium">Delete Account</span>
                    </button>
                  ) : (
                    <div id="delete-confirmation-ui" className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20 space-y-4">
                      <p className="text-xs text-red-500 font-bold leading-relaxed">
                        Verify your identity to request account deletion. This does not immediately erase records.
                      </p>
                      <p className="text-xs text-gray-400">Export records and original PDFs first. Support will review retention and process erasure. Cancel any subscription separately with its original provider.</p>
                      <button type="button" onClick={()=>{setShowSettingsModal(false);setShowDeleteConfirm(false);handleModeChange(AppMode.PROJECTS);}}>Open Projects to export invoices</button>
                      {deletionProvider === 'password' ? (
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                            Confirm Password
                          </label>
                          <input
                            type="password"
                            value={deletePassword}
                            onChange={event => setDeletePassword(event.target.value)}
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            className="w-full bg-black/40 border border-red-500/20 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-red-500/50"
                          />
                        </div>
                      ) : deletionProvider === 'google' || deletionProvider === 'apple' ? (
                        <p className="text-[10px] text-gray-400 leading-relaxed">
                          You will be asked to sign in with {deletionProvider === 'google' ? 'Google' : 'Apple'} again before deletion.
                        </p>
                      ) : (
                        <p className="text-[10px] text-gray-400 leading-relaxed">
                          Your current session will be verified before deletion.
                        </p>
                      )}
                      {deleteError && (
                        <p className="text-[10px] text-red-400 bg-red-400/10 p-2 rounded-lg border border-red-400/20">
                          {deleteError}
                        </p>
                      )}
                      {deleteSuccess && (
                        <p className="text-[10px] text-emerald-400 bg-emerald-400/10 p-2 rounded-lg border border-emerald-400/20">
                          Deletion request recorded for review. Your account has not yet been deleted. Contact privacy support for progress.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          id="confirm-delete-button"
                          onClick={handleDeleteAccount}
                          disabled={isDeletingAccount || deleteSuccess || (deletionProvider === 'password' && !deletePassword)}
                          className="flex-1 py-2 bg-red-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
                        >
                          {isDeletingAccount ? "Verifying..." : "Request Deletion"}
                        </button>
                        <button
                          id="cancel-delete-button"
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeletePassword('');
                            setDeleteError(null);
                          }}
                          disabled={isDeletingAccount}
                          className="flex-1 py-2 bg-white/10 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showUpgradeModal && (
          <ModalSheet
            onClose={() => setShowUpgradeModal(false)}
            ariaLabel={upgradeTier === 'business' ? 'Upgrade to Business' : 'Upgrade to Pro'}
            panelClassName="border-emerald-500/30 p-5 sm:p-7"
          >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />

              <div className="flex justify-center mb-4 sm:mb-6">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-500/10 rounded-2xl sm:rounded-3xl flex items-center justify-center text-emerald-500 hardware-glow">
                  <Crown size={36} />
                </div>
              </div>

              <div className="text-center mb-5 sm:mb-7">
                <h3 className="text-2xl font-bold mb-2">{upgradeTier === 'business' ? 'Unlock Business' : 'Unlock Pro Tools'}</h3>
                <p className="text-gray-400 text-sm">{upgradeTier === 'business' ? '£14.99/month. All Pro tools plus your business workspace.' : 'Get the full BS 7671 design suite and advanced features.'}</p>
                <div role="group" aria-label="Subscription plan" className="flex border border-white/10 rounded-lg overflow-hidden mt-4">
                  <button disabled={isUpgrading} aria-pressed={upgradeTier==='pro'} onClick={()=>setUpgradeTier('pro')} className={`flex-1 min-h-11 text-xs font-bold ${upgradeTier==='pro'?'bg-emerald-500/20 text-emerald-400':'text-gray-400'}`}>Pro · £5.99/mo</button>
                  <button disabled={isUpgrading} aria-pressed={upgradeTier==='business'} onClick={()=>setUpgradeTier('business')} className={`flex-1 min-h-11 text-xs font-bold ${upgradeTier==='business'?'bg-emerald-500/20 text-emerald-400':'text-gray-400'}`}>Business · £14.99/mo</button>
                </div>
              </div>

              <div className="space-y-3 mb-5 sm:mb-7">
                <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-500">
                    <CheckCircle2 size={18} />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">Smart Circuit Design</p>
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Full BS 7671 Compliance</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-500">
                    <CheckCircle2 size={18} />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">Advanced Exporting</p>
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">PDF & Image Summaries</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-500">
                    <CheckCircle2 size={18} />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">{upgradeTier === 'business' ? 'Projects & Business Documents' : 'Priority Support'}</p>
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{upgradeTier === 'business' ? 'Quotes, invoices & your branding' : 'Direct access to experts'}</p>
                  </div>
                </div>
              </div>

              {effectiveIsPro && <p className="text-xs text-emerald-400 mb-4">Change your existing plan, not a second subscription. Google Play applies unused value to the replacement plan. Apple and web downgrades start at renewal; current access remains until then. Changes must use the original payment provider.</p>}

              <button
                onClick={handleUpgrade}
                disabled={!Capacitor.isNativePlatform() || isUpgrading || (upgradeTier === 'business' ? effectiveIsBusiness : effectiveIsPro && !effectiveIsBusiness)}
                className="w-full min-h-14 bg-emerald-500 text-black px-4 py-4 rounded-2xl font-black uppercase tracking-wider text-[11px] sm:text-xs leading-tight text-center hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {!Capacitor.isNativePlatform() ? 'Available in the iOS and Android app' : isUpgrading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  (upgradeTier === 'business' ? effectiveIsBusiness : effectiveIsPro && !effectiveIsBusiness) ? 'Current Plan' : effectiveIsBusiness && upgradeTier==='pro' ? 'Change to Pro · £5.99/month' : effectiveIsPro && upgradeTier==='business' ? 'Change to Business · £14.99/month' : upgradeTier === 'business' ? 'Subscribe for £14.99/month' : 'Start 1 Month Free Trial'
                )}
              </button>

              {!user && Capacitor.isNativePlatform() && (
                <p className="mt-3 text-[10px] text-gray-500 text-center leading-relaxed">
                  {upgradeTier === 'business' ? 'Purchase without registering. An account is needed to save and sync your projects and business records.' : 'You can start the trial without an account. Creating an account is optional and lets you sync Pro access across your supported devices.'}
                </p>
              )}

              {!user && (
                <div className="mt-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => openAuthModal(true, true)}
                    className="w-full min-h-12 px-4 py-3 border border-emerald-500/40 text-emerald-400 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-500/10 transition-colors"
                  >
                    <Mail size={15} />
                    Create Account With Email
                  </button>
                  <p className="text-[10px] text-gray-500 text-center leading-relaxed">
                    Use any email address and password. A Google account is not required.
                  </p>
                </div>
              )}

              {ANDROID_BILLING_DIAGNOSTICS_ENABLED && Capacitor.getPlatform() === 'android' && (
                <div className="mt-4 border border-amber-400/30 bg-amber-400/5 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={openAndroidBillingDiagnostics}
                    className="w-full min-h-12 px-4 py-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-300 hover:bg-amber-400/10 transition-colors"
                  >
                    <Activity size={15} />
                    Billing Diagnostics
                  </button>

                  {showBillingDiagnostics && (
                    <div className="border-t border-amber-400/20 px-4 py-4 text-left space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Diagnostic Build Only</p>
                          <p className="mt-1 text-[10px] leading-relaxed text-gray-500">
                            This report contains store status only. It excludes account, payment, receipt and purchase-token data.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowBillingDiagnostics(false)}
                          className="p-2 text-gray-500 hover:text-white transition-colors"
                          aria-label="Close billing diagnostics"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      {billingDiagnostics ? (
                        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-x-3 gap-y-2 text-[10px] leading-relaxed">
                          <dt className="text-gray-500">Failed check</dt>
                          <dd className="font-mono text-amber-200 break-words">{billingDiagnostics.failedCheck}</dd>
                          <dt className="text-gray-500">Response code</dt>
                          <dd className="font-mono text-white break-words">{billingDiagnostics.responseCode ?? 'Not supplied'}</dd>
                          <dt className="text-gray-500">Debug message</dt>
                          <dd className="font-mono text-white break-words">{billingDiagnostics.debugMessage}</dd>
                          <dt className="text-gray-500">Connected</dt>
                          <dd className="font-mono text-white">{billingDiagnostics.billingConnected ? 'Yes' : 'No'}</dd>
                          <dt className="text-gray-500">Product details</dt>
                          <dd className="font-mono text-white">{billingDiagnostics.productDetailsReturned ? 'Returned' : 'Not returned'}</dd>
                          <dt className="text-gray-500">Eligible offer</dt>
                          <dd className="font-mono text-white">
                            {billingDiagnostics.eligibleOfferReturned ? `Returned (${billingDiagnostics.eligibleOfferCount})` : 'Not returned'}
                          </dd>
                          <dt className="text-gray-500">Requested ID</dt>
                          <dd className="font-mono text-white break-words">{billingDiagnostics.requestedProductIds.join(', ') || 'None'}</dd>
                          <dt className="text-gray-500">Returned ID</dt>
                          <dd className="font-mono text-white break-words">{billingDiagnostics.returnedProductIds.join(', ') || 'None'}</dd>
                        </dl>
                      ) : (
                        <p className="text-[10px] text-gray-500">Reading Google Play Billing state...</p>
                      )}

                      <button
                        type="button"
                        onClick={copyAndroidBillingDiagnostics}
                        disabled={!billingDiagnostics}
                        className="w-full min-h-11 px-4 py-3 border border-amber-400/30 text-amber-200 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-amber-400/10 transition-colors disabled:opacity-40"
                      >
                        {billingDiagnosticsCopyStatus === 'copied' ? <Check size={14} /> : <Copy size={14} />}
                        {billingDiagnosticsCopyStatus === 'copied'
                          ? 'Diagnostics Copied'
                          : billingDiagnosticsCopyStatus === 'error'
                            ? 'Copy Failed - Try Again'
                            : 'Copy Diagnostics'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col items-center gap-4 mt-6">
                {!user && (
                  <button
                    onClick={() => openAuthModal(false, true)}
                    className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Already Have An Account? Sign In
                  </button>
                )}

                <button
                  onClick={handleRestorePurchases}
                  className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest hover:text-emerald-400 transition-colors"
                >
                  Restore Purchases
                </button>

                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      setShowUpgradeModal(false);
                      setMode(AppMode.PRIVACY);
                    }}
                    className="text-[8px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Privacy Policy
                  </button>
                  <div className="w-1 h-1 bg-white/10 rounded-full" />
                  <button
                    onClick={() => {
                      setShowUpgradeModal(false);
                      setMode(AppMode.TERMS);
                    }}
                    className="text-[8px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Terms of Use
                  </button>
                </div>

                {!Capacitor.isNativePlatform() ? <p className="text-xs text-gray-400 text-center">{STORE_ONLY_PURCHASE_MESSAGE}</p> : <p className="text-[8px] text-gray-600 text-center leading-relaxed max-w-[280px]">
                  {upgradeTier === 'business' ? 'Business costs £14.99/month, billed monthly with no free trial. The store confirmation shows your local price. ' : effectiveIsBusiness ? 'Pro costs £5.99/month. Changing plans does not start a new free trial. Your payment provider confirms the effective date and any credit before you agree. ' : 'Payment of £5.99/mo will be charged to your account after the 1 month free trial. '}
                  Subscription automatically renews unless auto-renew is turned off at least 24-hours before the end of the current period.
                  Manage your subscription in your Account Settings.
                </p>}

                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors"
                >
                  Maybe Later
                </button>
              </div>
          </ModalSheet>
        )}

        {showPostPurchaseAccountPrompt && (
          <ModalSheet
            onClose={() => setShowPostPurchaseAccountPrompt(false)}
            ariaLabel="Create an account for subscription access"
            panelClassName="border-emerald-500/30 p-5 sm:p-7"
          >
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
                <CheckCircle2 size={34} />
              </div>
            </div>
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold mb-2">Pro Is Active</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Your purchase works on this device. Create an optional account with any email address to sync access across your supported devices and save business records.
              </p>
            </div>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => openAuthModal(true)}
                className="w-full min-h-14 bg-emerald-500 text-black px-4 py-4 rounded-2xl font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 hover:bg-emerald-400 transition-colors"
              >
                <Mail size={17} />
                Create Account With Email
              </button>
              <button
                type="button"
                onClick={() => openAuthModal(false)}
                className="w-full min-h-12 px-4 py-3 border border-white/10 text-gray-300 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-colors"
              >
                Already Have An Account? Sign In
              </button>
              <button
                type="button"
                onClick={() => setShowPostPurchaseAccountPrompt(false)}
                className="w-full py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors"
              >
                Not Now
              </button>
            </div>
          </ModalSheet>
        )}

        {showLoginModal && (
          <div className="safe-modal-shell fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeAuthModal}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="safe-modal-panel relative w-full max-w-md bg-hardware-card border border-hardware-border rounded-t-[32px] sm:rounded-[32px] p-5 sm:p-7 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-bold uppercase tracking-tight">{isSignUp ? 'Create Account' : 'Sign In'}</h3>
                <button onClick={closeAuthModal} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed mb-6">
                {isSignUp
                  ? 'Create an account with any email address and password. Google and Apple are optional.'
                  : 'Sign in with your email and password, or use an optional provider below.'}
              </p>

              <div className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full bg-black/40 border border-hardware-border rounded-2xl pl-12 pr-4 py-4 text-white font-bold focus:border-emerald-500/50 transition-colors outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-black/40 border border-hardware-border rounded-2xl pl-12 pr-12 py-4 text-white font-bold focus:border-emerald-500/50 transition-colors outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {loginError && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
                      <AlertTriangle className="text-red-500 shrink-0" size={18} />
                      <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest leading-relaxed">
                        {loginError}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => handleLogin('email')}
                    disabled={isLoggingIn}
                    className="w-full bg-emerald-500 text-black py-5 rounded-3xl font-black uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoggingIn ? (
                      <>
                        <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>{isSignUp ? 'Create Account' : 'Sign In'}</>
                    )}
                  </button>

                  <button
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors w-full text-center"
                  >
                    {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                  </button>
                </div>

                <div className="relative py-3">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/5"></div>
                  </div>
                  <div className="relative flex justify-center text-[8px] uppercase font-bold tracking-[0.2em] text-gray-600">
                    <span className="bg-hardware-card px-4">Or use an optional provider</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleLogin('google')}
                    disabled={isLoggingIn}
                    className="flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all group disabled:opacity-50"
                  >
                    <div className="w-5 h-5 bg-white/10 rounded flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                      <LogIn size={14} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest">Google</span>
                  </button>
                  <button
                    onClick={() => handleLogin('apple')}
                    disabled={isLoggingIn}
                    className="flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all group disabled:opacity-50"
                  >
                    <img
                      src="/apple-sign-in-icon.jpeg"
                      alt=""
                      aria-hidden="true"
                      className="h-5 w-5 rounded object-cover group-hover:scale-110 transition-transform"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Apple</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}

// End of The Sparkys Mate components

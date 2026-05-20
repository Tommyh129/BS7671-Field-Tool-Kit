import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  Apple,
  User as UserIcon,
  FileText,
  History as HistoryIcon,
  Mail,
  Eye,
  EyeOff,
  Star as StarIcon
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { downloadFile } from './utils/download';
import { SupplyType, InstallationMethod, CalculationResult, CircuitType, AppMode, CableCoreType, CableType, SupplySystem, DeviceType, CalculationHistory } from './types';
import { calculateCircuit } from './utils/calculations';
import { CABLE_DATABASE, PROTECTIVE_DEVICES, VOLTAGES } from './constants';
import ZsCalculator from './components/ZsCalculator';
import FaultCurrentCalculator from './components/FaultCurrentCalculator';
import CableResistanceCalculator from './components/CableResistanceCalculator';
import MaxLengthCalculator from './components/MaxLengthCalculator';
import EarthElectrodeCalculator from './components/EarthElectrodeCalculator';
import ThreePhaseCalculator from './components/ThreePhaseCalculator';
import SmartCircuitDesigner from './components/SmartCircuitDesigner';
import History from './components/History';
import { checkRegulatoryUpdates, RegulatoryUpdate } from './services/geminiService';
import { saveCalculation } from './services/historyService';
import { auth, db } from './firebase';
import { Capacitor } from '@capacitor/core';
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
  signInWithCredential,
  updateProfile
} from 'firebase/auth';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  getDoc,
  getDocFromServer,
  updateDoc
} from 'firebase/firestore';

// --- Types ---
interface UserProfile {
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

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Constants ---
const PRIVACY_POLICY_URL = 'https://ais-pre-cudgj6lkyex64hxupsknop-164877439791.europe-west1.run.app?page=privacy';
const TERMS_OF_SERVICE_URL = 'https://app.termly.io/policy-viewer/policy.html?policyUUID=6b10edd9-015b-429b-88bc-e8e2c415ed7d';
const SUPPORT_URL = 'https://ais-pre-cudgj6lkyex64hxupsknop-164877439791.europe-west1.run.app?page=support';
const SUPPORT_EMAIL = 'mailto:tommyholm@hotmail.co.uk';
const PRO_PRODUCT_ID = 'pro_subscription'; // Match your App Store/Play Store ID
const PRO_PRODUCT_TYPE = 'subscription';
const nativeProStorageKey = (uid: string) => `bs7671_native_pro_${uid}`;
const nativePurchaseUserOptions = (uid: string) => {
  // StoreKit appAccountToken must be a UUID. Firebase UIDs are not UUIDs, so
  // filtering iOS restores by Firebase UID can hide valid Apple subscriptions.
  return Capacitor.getPlatform() === 'ios' ? {} : { userId: uid };
};

const productUnavailableMessage = (productId: string) => {
  if (Capacitor.getPlatform() === 'ios') {
    return `Apple did not return the subscription product "${productId}". Check App Store Connect: the subscription Product ID must match exactly, be attached to bundle ID com.bs7671.fieldtoolkit, have price/localisation/review details completed, be available for sale/testing, and Paid Apps agreements must be active. If you already subscribed, use Restore Purchases.`;
  }

  return `Product ${productId} was not returned by the store. Check the product ID, package name, signing key, and closed testing availability.`;
};

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
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const TEST_EMAILS = ["test@example.com", "tester@circuitsmart.com"];
  const isAutoPro = (email: string) => {
    const e = email.toLowerCase().trim();
    return e === "tommyholm97@gmail.com" || TEST_EMAILS.includes(e) || e.endsWith("@test.com");
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const [regulatoryInfo, setRegulatoryInfo] = useState<RegulatoryUpdate>({
    version: "18th Edition",
    amendment: "Amendment 3:2024",
    date: "July 2024",
    summary: "Latest requirements for electrical installations in the UK, including updates on AFDDs and bidirectional power flow.",
    changes: []
  });
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [recentTools, setRecentTools] = useState<AppMode[]>([]);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  // Handle URL parameters for deep linking (Privacy, Account Deletion)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    if (page === 'privacy') {
      setMode(AppMode.PRIVACY);
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

  const setNativeProAccess = (uid: string, hasAccess: boolean) => {
    setHasNativeProPurchase(hasAccess);
    const storageKey = nativeProStorageKey(uid);
    if (hasAccess) {
      localStorage.setItem(storageKey, 'true');
    } else {
      localStorage.removeItem(storageKey);
    }
  };

  const effectiveIsPro = useMemo(() => {
    // Force Pro for specific testing accounts if needed
    if (user && isAutoPro(user.email || "")) return true;
    return isPro || hasNativeProPurchase;
  }, [isPro, hasNativeProPurchase, user]);
  
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [cleanMode, setCleanMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  
  // Shared States
  const [loadKw, setLoadKw] = useState<string>('');
  const [lengthM, setLengthM] = useState<string>('');
  const [supplyType, setSupplyType] = useState<SupplyType>(SupplyType.SINGLE_PHASE);
  const [cableCoreType, setCableCoreType] = useState<CableCoreType>(CableCoreType.MULTI_CORE);
  const [cableType, setCableType] = useState<CableType>(CableType.PVC_PVC);
  const [method, setMethod] = useState<InstallationMethod>(InstallationMethod.METHOD_C);
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
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const lastSavedHistoryRef = useRef<string | null>(null);

  // --- Regulatory Logic ---
  useEffect(() => {
    const fetchUpdates = async () => {
      // Check cache first
      const cached = localStorage.getItem('bs7671_regulatory_info');
      const cacheTime = localStorage.getItem('bs7671_cache_time');
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;

      if (cached && cacheTime && (now - parseInt(cacheTime)) < ONE_DAY) {
        setRegulatoryInfo(JSON.parse(cached));
        return;
      }

      setIsCheckingUpdates(true);
      try {
        const updates = await checkRegulatoryUpdates();
        setRegulatoryInfo(updates);
        localStorage.setItem('bs7671_regulatory_info', JSON.stringify(updates));
        localStorage.setItem('bs7671_cache_time', now.toString());
      } catch (error) {
        console.error("Failed to fetch regulatory updates:", error);
      } finally {
        setIsCheckingUpdates(false);
      }
    };
    fetchUpdates();
  }, []);

  // --- Core Type Logic ---
  // We keep the state but remove the restrictive filtering and auto-switching
  // to ensure all methods are available as requested.
  
  const allMethods = useMemo(() => Object.values(InstallationMethod), []);

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
      console.log("App: Auth State Changed ->", email || "No User");
      setUser(firebaseUser);
      
      // Auto-grant Pro to the admin/test emails for testing/demo
      const isAuto = isAutoPro(email);
      if (isAuto) {
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
              isPro: isAuto, // Auto-pro for admin/test
              displayName: firebaseUser.displayName || '',
              photoURL: firebaseUser.photoURL || '',
              createdAt: new Date().toISOString()
            });
          } else if (isAuto && !userDoc.data()?.isPro) {
            // Update existing admin/test doc to be Pro if it isn't
            console.log("App: Updating existing profile to Pro...");
            await updateDoc(userDocRef, { isPro: true });
          }

          unsubProfile = onSnapshot(userDocRef, (doc) => {
            if (doc.exists()) {
              const data = doc.data() as UserProfile;
              const proStatus = data.isPro || isAuto;
              console.log("App: Profile updated ->", proStatus ? "PRO" : "FREE", "Email:", data.email);
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

  const handleNativeSocialLogin = async (providerType: 'google' | 'apple') => {
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
      await signInWithCredential(auth, credential);
      return;
    }

    if (!nativeCredential?.idToken) {
      throw new Error("Apple sign-in did not return an ID token.");
    }

    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({
      idToken: nativeCredential.idToken,
      rawNonce: nativeCredential.nonce
    });
    await signInWithCredential(auth, credential);
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
        setShowLoginModal(false);
        setLoginEmail('');
        setLoginPassword('');
      } catch (error: any) {
        console.error("Email login failed", error);
        setLoginError(error.message || "Authentication failed.");
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
        setShowLoginModal(false);
      } else {
        await signInWithPopup(auth, provider);
        setShowLoginModal(false);
      }
    } catch (error: any) {
      console.error(`${providerType} login failed`, error);
      setLoginError(error.message || `${providerType} sign-in failed.`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // --- IAP Initialization ---
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    console.log("App: Initializing Native IAP...");

    if (!user) {
      setHasNativeProPurchase(false);
      return;
    }

    setHasNativeProPurchase(localStorage.getItem(nativeProStorageKey(user.uid)) === 'true');
    
    const checkActivePurchases = async () => {
      try {
        const { purchases } = await InAppPurchase.getActivePurchases(nativePurchaseUserOptions(user.uid));
        console.log("App: Active Purchases ->", purchases.length);
        const hasPro = purchases.some(p => p.productId === PRO_PRODUCT_ID);
        setNativeProAccess(user.uid, hasPro);
        if (hasPro) {
          await handleSuccessfulPurchase();
        }
      } catch (error) {
        console.error("App: Failed to check active purchases", error);
      }
    };

    checkActivePurchases();
  }, [user]);

  const handleSuccessfulPurchase = async () => {
    if (!user) return;
    console.log("App: Handling successful purchase for user:", user.uid);

    setNativeProAccess(user.uid, true);
    setIsPro(true);
    setShowUpgradeModal(false);

    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email || '',
        isPro: true,
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error("App: Failed to sync Pro status to Firestore; keeping local store entitlement active.", error);
    }
  };

  const handleRestorePurchases = async () => {
    if (!user) return;
    
    setIsSyncing(true);

    if (Capacitor.isNativePlatform()) {
      try {
        console.log("App: Restoring Native Purchases...");
        const { purchases } = await InAppPurchase.restorePurchases(nativePurchaseUserOptions(user.uid));
        const hasPro = purchases.some(p => p.productId === PRO_PRODUCT_ID);
        setNativeProAccess(user.uid, hasPro);
        if (hasPro) {
          await handleSuccessfulPurchase();
        } else {
          alert('No active Pro subscription was found for this store account.');
        }
      } catch (error) {
        console.error("App: Restore failed", error);
      } finally {
        setIsSyncing(false);
      }
      return;
    }

    // Web fallback (just sync with Firestore)
    setTimeout(() => {
      setIsSyncing(false);
    }, 2000);
  };

  const handleLogout = () => signOut(auth);

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    setDeleteError(null);
    setIsDeletingAccount(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      const result = await response.json();
      if (result.success) {
        setDeleteSuccess(true);
        setTimeout(async () => {
          await signOut(auth);
          setShowSettingsModal(false);
          setShowDeleteConfirm(false);
          setDeleteSuccess(false);
        }, 2000);
      } else {
        throw new Error(result.error || "Failed to delete account");
      }
    } catch (error: any) {
      console.error("Delete account failed", error);
      setDeleteError("Failed to delete account. You may need to re-authenticate first.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleUpgrade = async () => {
    console.log("App: handleUpgrade triggered", {
      hasUser: !!user,
      effectiveIsPro,
      isNative: Capacitor.isNativePlatform(),
      platform: Capacitor.getPlatform()
    });

    if (!user) {
      console.log("App: No user found, opening login...");
      setShowUpgradeModal(false);
      setShowLoginModal(true);
      return;
    }

    if (effectiveIsPro) {
      console.log("App: User is already Pro, aborting upgrade.");
      return;
    }

    setIsUpgrading(true);

    // Use Native IAP if on mobile
    if (Capacitor.isNativePlatform()) {
      try {
        console.log("App: Starting Native Purchase flow for:", PRO_PRODUCT_ID);
        const { allowed } = await InAppPurchase.canMakePurchases();
        if (!allowed) {
          throw new Error('Purchases are not available on this device or account.');
        }

        const { products } = await InAppPurchase.getProducts({
          productIds: [PRO_PRODUCT_ID],
          productType: PRO_PRODUCT_TYPE as any
        });
        console.log("App: Store products returned ->", products);

        if (!products.some(product => product.productId === PRO_PRODUCT_ID)) {
          throw new Error(productUnavailableMessage(PRO_PRODUCT_ID));
        }

        const transaction = await InAppPurchase.purchaseProduct({ 
          productId: PRO_PRODUCT_ID,
          productType: PRO_PRODUCT_TYPE as any,
          ...nativePurchaseUserOptions(user.uid)
        }) as any;
        
        if (transaction?.transactionId || transaction?.status === 'purchased') {
          console.log("App: Native Purchase success ->", transaction.transactionId);
          await handleSuccessfulPurchase();
        } else if (transaction?.status === 'pending') {
          alert('Your purchase is pending approval in the store. Pro will unlock once the purchase completes.');
        } else {
          throw new Error(transaction?.errorMessage || transaction?.errorCode || 'The store did not complete the purchase.');
        }
      } catch (error: any) {
        console.error("App: Native Purchase failed", error);
        alert(`Purchase failed: ${error?.message || 'Unknown error'}. Please try again.`);
      } finally {
        setIsUpgrading(false);
      }
      return;
    }

    // Fallback to Stripe for Web
    try {
      console.log("App: Falling back to Stripe checkout session...");
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, email: user.email }),
      });
      
      const { url, error } = await response.json();
      if (error) throw new Error(error);
      
      // Open Stripe in a new tab to avoid iframe blocking
      if (url) {
        console.log("App: Redirecting to Stripe ->", url);
        window.open(url, '_blank');
        // Keep modal open or show a "Check your new tab" message?
        // Let's close it for now as the user is moving to a new tab
        setShowUpgradeModal(false);
      }
    } catch (error) {
      console.error("Checkout failed", error);
      // Fallback for demo if Stripe keys aren't set
      setShowUpgradeModal(true);
    } finally {
      setIsUpgrading(false);
    }
  };

  const result = useMemo(() => {
    if (mode === AppMode.SMART_CIRCUIT || mode === AppMode.VOLTAGE_DROP) {
      return calculateCircuit(
        parseFloat(loadKw) || 0,
        parseFloat(lengthM) || 0,
        supplyType,
        method,
        cableType,
        circuitType,
        30, // ambientTemp
        1,  // groupingCount
        parseFloat(ze) || 0.35,
        deviceType
      );
    }
    return null;
  }, [loadKw, lengthM, supplyType, method, cableType, circuitType, mode, ze, deviceType]);

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
      if (current <= 0) return null;
      const cableSizes = CABLE_DATABASE[cableType];
      return cableSizes.find(c => c.capacity[method] >= current);
    }
    return null;
  }, [targetCurrent, method, cableType, mode]);

  const handleCalculate = () => {
    setShowResults(true);
  };

  const handleShareResult = async (text: string) => {
    setSharedText(text);
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
          title: 'BS7671 Field Toolkit Calculation',
          text: sharedText
        });
        return;
      }

      if (navigator.share) {
        await navigator.share({ title: 'BS7671 Field Toolkit Calculation', text: sharedText });
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
    if (!sharedText || isSavingTextPDF) return;
    setIsSavingTextPDF(true);
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });
      const margin = 40;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const lineHeight = 14;
      let y = 52;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.text('BS7671 Field Toolkit Calculation', margin, y);
      y += 22;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(90);
      pdf.text(new Date().toLocaleDateString(), margin, y);
      y += 28;

      pdf.setTextColor(20);
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(10);

      const lines = pdf.splitTextToSize(sharedText, pageWidth - margin * 2);
      lines.forEach((line: string) => {
        if (y > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(line, margin, y);
        y += lineHeight;
      });

      const pdfDataUrl = pdf.output('datauristring');
      await downloadFile(pdfDataUrl, `bs7671-calculation-${Date.now()}.pdf`, 'application/pdf');
      setTimeout(() => setIsSavingTextPDF(false), 2000);
    } catch (err) {
      console.error('Error generating text PDF:', err);
      setIsSavingTextPDF(false);
    }
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
Device: ${result.protectiveDevice} A (${deviceType})
V-Drop: ${result.voltageDrop.toFixed(2)}V (${result.voltageDropPercentage.toFixed(1)}%)
Status: ${result.isCompliant ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}
--------------------------------
Calculated via BS7671 Field Toolkit
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
    if (!pdfRef.current || isSavingPDF) return;
    setIsSavingPDF(true);
    try {
      const dataUrl = await toPng(pdfRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        style: {
          borderRadius: '0',
        }
      });
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [400, 600] // Match the report size roughly
      });
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, 400, 600);
      const pdfDataUrl = pdf.output('datauristring');
      
      await downloadFile(pdfDataUrl, `bs7671-report-${Date.now()}.pdf`, 'application/pdf');
      
      setTimeout(() => setIsSavingPDF(false), 2000);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setIsSavingPDF(false);
    }
  };

  const handleSaveHistory = async () => {
    if (!result || isSavingHistory) return;
    setIsSavingHistory(true);
    try {
      await saveCalculation(
        user?.uid,
        'circuit',
        `Circuit: ${loadKw}kW / ${lengthM}m`,
        { loadKw, lengthM, supplyType, cableCoreType, cableType, method, circuitType, ze, deviceType },
        { 
          cableSize: result.cableSize, 
          protectiveDevice: result.protectiveDevice, 
          voltageDrop: result.voltageDrop, 
          voltageDropPercentage: result.voltageDropPercentage,
          isCompliant: result.isCompliant,
          zs: result.zs,
          maxZs: result.maxZs
        }
      );
      setTimeout(() => setIsSavingHistory(false), 2000);
    } catch (error) {
      console.error('Error saving to history:', error);
      setIsSavingHistory(false);
    }
  };

  useEffect(() => {
    if (!result || !showResults) return;

    const payload = {
      type: 'circuit' as const,
      title: `Circuit: ${loadKw}kW / ${lengthM}m`,
      inputs: { loadKw, lengthM, supplyType, cableCoreType, cableType, method, circuitType, ze, deviceType },
      results: {
        cableSize: result.cableSize,
        protectiveDevice: result.protectiveDevice,
        voltageDrop: result.voltageDrop,
        voltageDropPercentage: result.voltageDropPercentage,
        isCompliant: result.isCompliant,
        zs: result.zs,
        maxZs: result.maxZs
      }
    };
    const signature = JSON.stringify(payload);
    if (lastSavedHistoryRef.current === signature) return;
    lastSavedHistoryRef.current = signature;

    saveCalculation(user?.uid, payload.type, payload.title, payload.inputs, payload.results).catch(error => {
      console.error('Error auto-saving circuit history:', error);
    });
  }, [result, showResults, loadKw, lengthM, supplyType, cableCoreType, cableType, method, circuitType, ze, deviceType, user]);

  const goHome = () => {
    setMode(AppMode.HOME);
    setShowResults(false);
    setLoadKw('');
    setLengthM('');
    setTargetCurrent('');
  };

  const handleModeChange = (newMode: AppMode) => {
    const proModes = [
      AppMode.SMART_CIRCUIT,
      AppMode.FAULT_CURRENT,
      AppMode.EARTH_ELECTRODE,
      AppMode.MAX_LENGTH,
      AppMode.CABLE_RESISTANCE
    ];
    
    if (proModes.includes(newMode) && !effectiveIsPro) {
      setShowUpgradeModal(true);
      return;
    }
    setMode(newMode);
    setShowResults(false);
    
    // Update recent tools
    setRecentTools(prev => {
      const filtered = prev.filter(t => t !== newMode);
      return [newMode, ...filtered].slice(0, 3);
    });
  };

  const renderHome = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 gap-4"
    >
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-white mb-1 tracking-tight">BS7671 Field Toolkit</h2>
          <p className="text-gray-500 text-sm font-medium">Precision electrical engineering suite.</p>
        </div>
        {!effectiveIsPro && (
          <button 
            onClick={handleUpgrade}
            className="bg-emerald-500/10 text-emerald-500 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
          >
            <Crown size={12} />
            Go Pro
          </button>
        )}
      </div>

      {/* Regulatory Status Card */}
      <div className="bg-hardware-card p-6 rounded-3xl border border-hardware-border mb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-emerald-500" size={18} />
            <h3 className="font-bold text-white">BS 7671 Compliance</h3>
          </div>
          <button 
            onClick={async () => {
              setIsCheckingUpdates(true);
              try {
                const updates = await checkRegulatoryUpdates();
                setRegulatoryInfo(updates);
              } catch (error: any) {
                if (error?.message?.includes("Requested entity was not found")) {
                  setHasApiKey(false);
                }
              } finally {
                setIsCheckingUpdates(false);
              }
            }}
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
          * Calculations are based on {regulatoryInfo.version} {regulatoryInfo.amendment} requirements.
        </p>
      </div>

      {recentTools.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 ml-1">Recently Used</p>
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
            {recentTools.map((t) => (
              <button
                key={t}
                onClick={() => handleModeChange(t)}
                className="px-4 py-3 bg-hardware-card border border-hardware-border rounded-2xl flex items-center gap-2 shrink-0 hover:border-emerald-500/30 transition-colors"
              >
                {t === AppMode.SMART_CIRCUIT && <Cpu size={14} className="text-emerald-500" />}
                {t === AppMode.VOLTAGE_DROP && <Waves size={14} className="text-blue-500" />}
                {t === AppMode.THREE_PHASE && <Zap size={14} className="text-orange-500" />}
                {t === AppMode.CABLE_FINDER && <Search size={14} className="text-purple-500" />}
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                  {t.replace('_', ' ')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Free Tools Section */}
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1">Free Tools</p>

      <button 
        onClick={() => handleModeChange(AppMode.ZS_CALCULATOR)}
        className="bg-hardware-card p-6 rounded-3xl border border-hardware-border flex items-center gap-4 hover:bg-[#1c1d21] transition-all group active:scale-[0.98]"
      >
        <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
          <Activity size={28} />
        </div>
        <div className="text-left">
          <h3 className="font-bold text-lg text-white">Zs Calculator</h3>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Loop Impedance Check</p>
        </div>
        <ChevronRight className="ml-auto text-gray-700 group-hover:text-emerald-500 transition-colors" />
      </button>

      <button 
        onClick={() => handleModeChange(AppMode.VOLTAGE_DROP)}
        className="bg-hardware-card p-6 rounded-3xl border border-hardware-border flex items-center gap-4 hover:bg-[#1c1d21] transition-all group active:scale-[0.98]"
      >
        <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
          <Waves size={28} />
        </div>
        <div className="text-left">
          <h3 className="font-bold text-lg text-white">Voltage Drop</h3>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Compliance Check</p>
        </div>
        <ChevronRight className="ml-auto text-gray-700 group-hover:text-blue-500 transition-colors" />
      </button>

      <button 
        onClick={() => handleModeChange(AppMode.THREE_PHASE)}
        className="bg-hardware-card p-6 rounded-3xl border border-hardware-border flex items-center gap-4 hover:bg-[#1c1d21] transition-all group active:scale-[0.98]"
      >
        <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
          <Cpu size={28} />
        </div>
        <div className="text-left">
          <h3 className="font-bold text-lg text-white">Power Calculator</h3>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">kW / Amps Converter</p>
        </div>
        <ChevronRight className="ml-auto text-gray-700 group-hover:text-purple-500 transition-colors" />
      </button>

      <button 
        onClick={() => handleModeChange(AppMode.CABLE_FINDER)}
        className="bg-hardware-card p-6 rounded-3xl border border-hardware-border flex items-center gap-4 hover:bg-[#1c1d21] transition-all group active:scale-[0.98]"
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
        className="bg-hardware-card p-6 rounded-3xl border border-hardware-border flex items-center gap-4 hover:bg-[#1c1d21] transition-all group active:scale-[0.98]"
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
      <div className="mt-4 mb-2">
        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1 ml-1">Pro Features</p>
      </div>

      <button 
        onClick={() => handleModeChange(AppMode.SMART_CIRCUIT)}
        className="bg-hardware-card p-6 rounded-3xl border border-hardware-border flex items-center gap-4 hover:bg-[#1c1d21] transition-all group active:scale-[0.98] relative overflow-hidden"
      >
        <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform hardware-glow">
          <Cpu size={28} />
        </div>
        <div className="text-left">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-white">Smart Circuit Designer</h3>
            {!effectiveIsPro && <Lock size={14} className="text-gray-600" />}
          </div>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Full BS 7671 Design</p>
        </div>
        {!effectiveIsPro && (
          <div className="absolute top-0 right-0 bg-emerald-500 text-black px-3 py-1 text-[8px] font-black uppercase tracking-tighter rotate-45 translate-x-4 translate-y-2 shadow-lg">
            PRO
          </div>
        )}
        <ChevronRight className="ml-auto text-gray-700 group-hover:text-emerald-500 transition-colors" />
      </button>

      <div className="grid grid-cols-2 gap-4">
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
            <div className="absolute top-0 right-0 bg-emerald-500 text-black px-2 py-0.5 text-[6px] font-black uppercase tracking-tighter rotate-45 translate-x-3 translate-y-1 shadow-lg">
              PRO
            </div>
          )}
        </button>

        <button 
          onClick={() => handleModeChange(AppMode.CABLE_RESISTANCE)}
          className="bg-hardware-card p-5 rounded-3xl border border-hardware-border flex flex-col gap-3 hover:bg-[#1c1d21] transition-all group active:scale-[0.98] relative overflow-hidden"
        >
          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
            <Ruler size={20} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-white">Resistance</h3>
              {!effectiveIsPro && <Lock size={10} className="text-gray-600" />}
            </div>
            <p className="text-gray-500 text-[8px] font-bold uppercase tracking-wider">R1 + R2 Calculator</p>
          </div>
          {!effectiveIsPro && (
            <div className="absolute top-0 right-0 bg-emerald-500 text-black px-2 py-0.5 text-[6px] font-black uppercase tracking-tighter rotate-45 translate-x-3 translate-y-1 shadow-lg">
              PRO
            </div>
          )}
        </button>

        <button 
          onClick={() => handleModeChange(AppMode.MAX_LENGTH)}
          className="bg-hardware-card p-5 rounded-3xl border border-hardware-border flex flex-col gap-3 hover:bg-[#1c1d21] transition-all group active:scale-[0.98] relative overflow-hidden"
        >
          <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
            <Maximize size={20} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-white">Max Length</h3>
              {!effectiveIsPro && <Lock size={10} className="text-gray-600" />}
            </div>
            <p className="text-gray-500 text-[8px] font-bold uppercase tracking-wider">Length Limits</p>
          </div>
          {!effectiveIsPro && (
            <div className="absolute top-0 right-0 bg-emerald-500 text-black px-2 py-0.5 text-[6px] font-black uppercase tracking-tighter rotate-45 translate-x-3 translate-y-1 shadow-lg">
              PRO
            </div>
          )}
        </button>

        <button 
          onClick={() => handleModeChange(AppMode.EARTH_ELECTRODE)}
          className="bg-hardware-card p-5 rounded-3xl border border-hardware-border flex flex-col gap-3 hover:bg-[#1c1d21] transition-all group active:scale-[0.98] relative overflow-hidden"
        >
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Activity size={20} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-white">TT Electrode</h3>
              {!effectiveIsPro && <Lock size={10} className="text-gray-600" />}
            </div>
            <p className="text-gray-500 text-[8px] font-bold uppercase tracking-wider">Earth Resistance</p>
          </div>
          {!effectiveIsPro && (
            <div className="absolute top-0 right-0 bg-emerald-500 text-black px-2 py-0.5 text-[6px] font-black uppercase tracking-tighter rotate-45 translate-x-3 translate-y-1 shadow-lg">
              PRO
            </div>
          )}
        </button>
      </div>

      {!effectiveIsPro && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-8 bg-emerald-500 rounded-[40px] text-black relative overflow-hidden group cursor-pointer mt-4"
          onClick={handleUpgrade}
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
                handleUpgrade();
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
            <p className="text-gray-700 text-[8px] uppercase tracking-widest">BS7671 Field Toolkit v1.0.2</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30`}>
      {/* Header */}
      {!cleanMode && (
        <header id="main-header" className="bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5 px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 sticky top-0 z-20">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div id="header-logo" className="flex items-center gap-2 cursor-pointer" onClick={goHome}>
              <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <img src="/icon.svg" alt="App Icon" className="w-full h-full object-cover" />
              </div>
              <h1 className="font-bold text-lg tracking-tight">BS7671 Field Toolkit</h1>
            </div>
            <div className="flex items-center gap-3">
              {effectiveIsPro && (
                <div id="pro-badge" className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded border border-emerald-500/20 text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                  <Star size={8} fill="currentColor" />
                  Pro
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
                  onClick={() => setShowLoginModal(true)} 
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

      <main className={`max-w-md mx-auto p-6 ${cleanMode ? 'pb-6' : 'pb-24'}`}>
        <AnimatePresence mode="wait">
          {mode === AppMode.HOME ? (
            renderHome()
          ) : mode === AppMode.ZS_CALCULATOR ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={goHome} className="text-gray-500 hover:text-white transition-colors">
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
                <button onClick={goHome} className="text-gray-500 hover:text-white transition-colors">
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
                <button onClick={goHome} className="text-gray-500 hover:text-white transition-colors">
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
                <button onClick={goHome} className="text-gray-500 hover:text-white transition-colors">
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
                <button onClick={goHome} className="text-gray-500 hover:text-white transition-colors">
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
                <button onClick={goHome} className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1 text-emerald-500">Smart Circuit Designer</h2>
              </div>
              <SmartCircuitDesigner onShare={handleShareResult} />
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
                <button onClick={goHome} className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1 text-orange-500">Power Calculator</h2>
              </div>
              <ThreePhaseCalculator onShare={handleShareResult} />
            </motion.div>
          ) : mode === AppMode.HISTORY ? (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={goHome} className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1 text-blue-500">Calculation History</h2>
              </div>
              <History onSelect={(item) => {
                // Future: logic to load history item back into calculator
              }} />
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
                <button onClick={goHome} className="text-gray-500 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold flex-1">Privacy Policy</h2>
              </div>
              
              <div className="bg-hardware-card p-6 rounded-3xl border border-hardware-border space-y-4 text-sm text-gray-400 leading-relaxed">
                <p>
                  Your privacy is important to us. This Privacy Policy explains how BS7671 Field Toolkit collects, uses, and protects your information.
                </p>
                <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">1. Data Collection</h3>
                <p>
                  We collect your email address and display name when you create an account to provide cloud sync and Pro features.
                </p>
                <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">2. Data Usage</h3>
                <p>
                  Your data is used solely for account management, subscription verification, and saving your calculation history.
                </p>
                <h3 className="text-white font-bold uppercase text-[10px] tracking-widest">3. Third Parties</h3>
                <p>
                  We use Firebase for authentication and database services, and Stripe for payment processing. We do not sell your data to third parties.
                </p>
                <div className="pt-4 border-t border-white/5">
                  <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer" className="text-emerald-500 font-bold uppercase text-[10px] tracking-widest hover:underline">
                    View Full Policy External
                  </a>
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
                <button onClick={goHome} className="text-gray-500 hover:text-white transition-colors">
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
                    If you wish to delete your account and all associated data, you can do so directly within the app settings or by following the instructions below.
                  </p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>All saved calculations will be permanently removed.</li>
                    <li>Your subscription information will be disconnected.</li>
                    <li>This action cannot be undone.</li>
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
                    <p className="text-sm text-white">Please email <a href={SUPPORT_URL} className="text-emerald-500 underline">tommyholm@hotmail.co.uk</a> with your account email to request manual deletion.</p>
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
                <button onClick={goHome} className="text-gray-500 hover:text-white transition-colors">
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
                  <button onClick={goHome} className="text-gray-500 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                  </button>
                  <h2 className="text-xl font-bold flex-1">
                    {mode === AppMode.SMART_CIRCUIT && 'Smart Circuit'}
                    {mode === AppMode.VOLTAGE_DROP && 'Voltage Drop'}
                    {mode === AppMode.THREE_PHASE && 'Power Calculator'}
                    {mode === AppMode.CABLE_FINDER && 'Cable Size Finder'}
                    {mode === AppMode.ZS_CALCULATOR && 'Zs Calculator'}
                  </h2>
                  {!showResults && (
                    <button 
                      onClick={() => {
                        setLoadKw('');
                        setLengthM('');
                        setTargetCurrent('');
                      }} 
                      className="text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-red-500 transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>

              {!showResults ? (
                <div className="space-y-6">
                  {/* Inputs based on mode */}
                  <div className="grid gap-4">
                    {mode === AppMode.THREE_PHASE && (
                      <div className="bg-hardware-card p-5 rounded-3xl border border-hardware-border">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-3 tracking-widest">Supply Type</label>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.values(SupplyType).map((t) => (
                            <button
                              key={t}
                              onClick={() => setSupplyType(t)}
                              className={`py-3 px-4 rounded-2xl text-[10px] font-bold transition-all border ${
                                supplyType === t 
                                  ? 'bg-orange-500 text-white border-orange-400 shadow-lg shadow-orange-500/20' 
                                  : 'bg-hardware-card text-gray-400 border-hardware-border hover:border-white/20'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {(mode === AppMode.SMART_CIRCUIT || mode === AppMode.VOLTAGE_DROP || mode === AppMode.THREE_PHASE) && (
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

                    {(mode === AppMode.SMART_CIRCUIT || mode === AppMode.VOLTAGE_DROP) && (
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
                  {(mode === AppMode.SMART_CIRCUIT || mode === AppMode.VOLTAGE_DROP) && (
                    <div className="space-y-4">
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

                      {/* Cable Core Type */}
                      {(mode === AppMode.SMART_CIRCUIT || mode === AppMode.CABLE_FINDER || mode === AppMode.VOLTAGE_DROP) && (
                        <div className="space-y-6">
                          <div>
                            <span className="block text-[10px] font-bold text-gray-500 uppercase mb-3 ml-1 tracking-widest">Cable Core Type</span>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.values(CableCoreType).map((type) => (
                                <button
                                  key={type}
                                  onClick={() => setCableCoreType(type)}
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

                          {mode === AppMode.SMART_CIRCUIT && (
                            <div className="space-y-6 pt-4 border-t border-white/5">
                              <div>
                                <span className="block text-[10px] font-bold text-gray-500 uppercase mb-3 ml-1 tracking-widest">External Impedance (Ze) Ω</span>
                                <div className="bg-hardware-card p-5 rounded-3xl border border-hardware-border">
                                  <div className="flex items-center gap-4">
                                    <Activity size={24} className="text-orange-500" />
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      value={ze}
                                      onChange={(e) => setZe(e.target.value)}
                                      placeholder="0.35"
                                      className="bg-transparent w-full text-3xl font-mono font-bold focus:outline-none placeholder:text-gray-800"
                                    />
                                  </div>
                                </div>
                              </div>

                              <div>
                                <span className="block text-[10px] font-bold text-gray-500 uppercase mb-3 ml-1 tracking-widest">Protection Device Type</span>
                                <div className="grid grid-cols-1 gap-2">
                                  {Object.values(DeviceType).map((type) => (
                                    <button
                                      key={type}
                                      onClick={() => setDeviceType(type)}
                                      className={`py-4 px-4 rounded-2xl text-xs font-bold text-left transition-all border ${
                                        deviceType === type 
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
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(mode === AppMode.SMART_CIRCUIT || mode === AppMode.CABLE_FINDER || mode === AppMode.VOLTAGE_DROP) && (
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
                        {allMethods.map((m) => (
                          <button
                            key={m}
                            onClick={() => setMethod(m)}
                            className={`py-4 px-5 rounded-2xl text-xs font-bold text-left transition-all border flex items-center justify-between shrink-0 ${
                              method === m 
                                ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20' 
                                : 'bg-hardware-card text-gray-400 border-hardware-border hover:border-white/20'
                            }`}
                          >
                            <span className="truncate pr-2">{m}</span>
                            {method === m && <CheckCircle2 size={16} className="shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleCalculate}
                    className="w-full bg-emerald-500 text-white py-5 rounded-3xl font-bold text-lg shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    View Results
                    <ChevronRight size={20} />
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Results Display */}
                  {mode === AppMode.THREE_PHASE && threePhaseResult && (
                    <div className="bg-hardware-card p-8 rounded-[40px] border border-hardware-border text-center relative overflow-hidden">
                      <div className="dashed-ring absolute inset-0 pointer-events-none opacity-50" />
                      <span className="block text-[10px] font-bold text-gray-500 uppercase mb-4 tracking-widest relative z-10">Calculated Current</span>
                      <div className="flex items-baseline justify-center gap-2 relative z-10">
                        <span className="text-7xl font-mono font-bold tracking-tighter">{threePhaseResult.toFixed(1)}</span>
                        <span className="text-2xl font-bold text-orange-500">A</span>
                      </div>
                      <p className="mt-6 text-[10px] font-bold uppercase tracking-widest text-gray-500 leading-relaxed relative z-10">
                        {loadKw}kW @ {supplyType === SupplyType.THREE_PHASE ? '400V' : '230V'} • PF 0.9
                      </p>
                    </div>
                  )}

                  {mode === AppMode.CABLE_FINDER && cableFinderResult && (
                    <div className="bg-hardware-card p-8 rounded-[40px] border border-hardware-border text-center relative overflow-hidden">
                      <div className="dashed-ring absolute inset-0 pointer-events-none opacity-50" />
                      <span className="block text-[10px] font-bold text-gray-500 uppercase mb-4 tracking-widest relative z-10">Recommended Size</span>
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

                  {(mode === AppMode.SMART_CIRCUIT || mode === AppMode.VOLTAGE_DROP) && result && (
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
                      <div className={`p-6 rounded-[32px] flex items-center gap-4 border ${result.isCompliant ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${result.isCompliant ? 'bg-emerald-500' : 'bg-red-500'} text-white shadow-lg hardware-glow`}>
                          {result.isCompliant ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
                        </div>
                        <div>
                          <h3 className="font-bold text-lg leading-tight uppercase tracking-tight">
                            {result.isCompliant ? 'Compliant' : 'Non-Compliant'}
                          </h3>
                          <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                            {result.isCompliant ? 'Meets BS 7671 limits' : 'Exceeds allowed limits'}
                          </p>
                        </div>
                      </div>

                      {mode === AppMode.SMART_CIRCUIT && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-hardware-card p-6 rounded-[32px] border border-hardware-border">
                            <span className="block text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-widest">Current</span>
                            <div className="flex items-baseline gap-1">
                              <span className="text-3xl font-mono font-bold">{result.loadCurrent.toFixed(1)}</span>
                              <span className="text-xs font-bold text-emerald-500">A</span>
                            </div>
                          </div>
                          <div className="bg-hardware-card p-6 rounded-[32px] border border-hardware-border">
                            <span className="block text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-widest">Device</span>
                            <div className="flex items-baseline gap-1">
                              <span className="text-3xl font-mono font-bold">{result.protectiveDevice}</span>
                              <span className="text-xs font-bold text-emerald-500">A</span>
                              <span className="block text-[8px] text-gray-500 uppercase font-bold tracking-widest mt-1">{deviceType}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="bg-emerald-500 p-8 rounded-[40px] text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden hardware-glow">
                        <div className="relative z-10">
                          <span className="block text-[10px] font-bold text-white/50 uppercase mb-2 tracking-widest">Cable Size</span>
                          <div className="flex items-baseline gap-2">
                            <span className="text-6xl font-mono font-bold tracking-tighter">{result.cableSize}</span>
                            <span className="text-xl font-bold opacity-50">mm²</span>
                          </div>
                        </div>
                        <Zap className="absolute -right-6 -bottom-6 text-white/10 w-40 h-40 rotate-12" />
                      </div>

                      <div className="bg-hardware-card rounded-[32px] border border-hardware-border overflow-hidden">
                        <div className="p-6 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Voltage Drop</span>
                            <div className="text-right">
                              <span className="font-mono font-bold text-xl">{result.voltageDrop.toFixed(2)}V</span>
                              <span className={`ml-2 text-[10px] font-bold px-2 py-1 rounded-lg ${result.isCompliant ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
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
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Earth Loop (Zs)</span>
                              <div className="text-right">
                                <span className="font-mono font-bold text-xl">{result.zs.toFixed(2)}Ω</span>
                                <span className={`ml-2 text-[10px] font-bold px-2 py-1 rounded-lg ${result.zsCompliant ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
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
                      className="flex-1 bg-emerald-500/10 border border-emerald-500/20 py-5 rounded-3xl font-bold text-emerald-500 hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSavingHistory ? <Check size={18} /> : <HistoryIcon size={18} />}
                      {isSavingHistory ? 'Saved' : 'Save History'}
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
      </main>

      {/* Navigation Bar (Mobile Style) */}
      {!cleanMode && (
        <nav className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/80 backdrop-blur-xl border-t border-white/5 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] z-20">
          <div className="max-w-md mx-auto flex justify-around items-center">
            <button onClick={goHome} className={`flex flex-col items-center gap-1 ${mode === AppMode.HOME ? 'text-emerald-500' : 'text-gray-500'}`}>
              <LayoutGrid size={20} />
              <span className="text-[10px] font-bold uppercase">Home</span>
            </button>
            <button onClick={() => handleModeChange(AppMode.SMART_CIRCUIT)} className={`flex flex-col items-center gap-1 ${mode === AppMode.SMART_CIRCUIT ? 'text-emerald-500' : 'text-gray-500'}`}>
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
          </div>
        </nav>
      )}

      <AnimatePresence>
        {showTextShareMenu && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTextShareMenu(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-md bg-hardware-card border border-hardware-border rounded-t-[40px] sm:rounded-[40px] p-8"
            >
              <div className="flex items-center justify-between mb-8">
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

              <div className="mt-8 pt-8 border-t border-white/5">
                <p className="text-[10px] text-gray-500 text-center uppercase font-bold tracking-widest mb-4">Preview</p>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-black/30 border border-white/5 p-4 text-[10px] leading-relaxed text-gray-300 font-mono">
                  {sharedText}
                </pre>
              </div>
            </motion.div>
          </div>
        )}

        {showShareMenu && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShareMenu(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-md bg-hardware-card border border-hardware-border rounded-t-[40px] sm:rounded-[40px] p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold">Export Summary</h3>
                <button onClick={() => setShowShareMenu(false)} className="p-2 bg-white/5 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={handleShareText}
                  className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors group"
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
                  className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors group disabled:opacity-50"
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
                  className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors group disabled:opacity-50"
                >
                  <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
                    {isSavingPDF ? <Check size={24} /> : <FileText size={24} />}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {isSavingPDF ? 'Saved' : 'Save PDF'}
                  </span>
                </button>
              </div>

              <div className="mt-8 pt-8 border-t border-white/5">
                <p className="text-[10px] text-gray-500 text-center uppercase font-bold tracking-widest">Preview</p>
                <div className="mt-4 p-4 bg-hardware-bg rounded-2xl border border-hardware-border overflow-hidden">
                  <div ref={shareRef} className="p-6 bg-hardware-bg text-white font-sans">
                    <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                      <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white">
                        <Cpu size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm">Circuit Summary</h4>
                        <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">BS7671 Field Toolkit • {regulatoryInfo.version}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                      <div>
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Load</span>
                        <span className="text-sm font-mono font-bold">{loadKw} kW</span>
                      </div>
                      <div>
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Length</span>
                        <span className="text-sm font-mono font-bold">{lengthM} m</span>
                      </div>
                      <div>
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Cable Type</span>
                        <span className="text-sm font-mono font-bold uppercase truncate block">{cableType}</span>
                      </div>
                      <div>
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Core Type</span>
                        <span className="text-sm font-mono font-bold uppercase">{cableCoreType}</span>
                      </div>
                      <div>
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Cable Size</span>
                        <span className="text-sm font-mono font-bold text-emerald-500">{result?.cableSize} mm²</span>
                      </div>
                      <div>
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Device</span>
                        <span className="text-sm font-mono font-bold">{result?.protectiveDevice} A ({deviceType})</span>
                      </div>
                      <div>
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">V-Drop</span>
                        <span className="text-sm font-mono font-bold">{result?.voltageDrop.toFixed(2)}V ({result?.voltageDropPercentage.toFixed(1)}%)</span>
                      </div>
                      <div>
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Zs Value</span>
                        <span className="text-sm font-mono font-bold">{result?.zs?.toFixed(2)} Ω</span>
                      </div>
                      <div>
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
                        Calculated via BS7671 Field Toolkit
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hidden PDF Report (White Background) */}
              <div className="fixed -left-[9999px] top-0">
                <div ref={pdfRef} className="w-[400px] p-10 bg-white text-black font-sans border border-gray-200">
                  <div className="flex items-center gap-4 mb-8 border-b border-gray-100 pb-6">
                    <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
                      <Cpu size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-xl text-gray-900">Electrical Circuit Report</h4>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">BS7671 Field Toolkit • {regulatoryInfo.version}</p>
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
                      BS7671 Field Toolkit Professional
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMethodInfo && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
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
              className="relative w-full max-w-md bg-hardware-card border border-hardware-border rounded-t-[40px] sm:rounded-[40px] p-8 max-h-[80vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold">Installation Methods</h3>
                <button onClick={() => setShowMethodInfo(false)} className="p-2 bg-white/5 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-6 text-sm">
                <div>
                  <h4 className="font-bold text-emerald-500 mb-2 uppercase tracking-widest text-[10px]">Method A</h4>
                  <p className="text-gray-400">In an insulated wall. (e.g. Twin & Earth in a stud wall with insulation).</p>
                </div>
                <div>
                  <h4 className="font-bold text-emerald-500 mb-2 uppercase tracking-widest text-[10px]">Method B</h4>
                  <p className="text-gray-400">In conduit or trunking on a wall.</p>
                </div>
                <div>
                  <h4 className="font-bold text-emerald-500 mb-2 uppercase tracking-widest text-[10px]">Method C</h4>
                  <p className="text-gray-400">Clipped direct. (Most common for domestic surface wiring).</p>
                </div>
                <div>
                  <h4 className="font-bold text-emerald-500 mb-2 uppercase tracking-widest text-[10px]">Method D</h4>
                  <p className="text-gray-400">Direct in ground or in ducting in ground.</p>
                </div>
                <div>
                  <h4 className="font-bold text-emerald-500 mb-2 uppercase tracking-widest text-[10px]">Method E, F, G</h4>
                  <p className="text-gray-400">In free air, on perforated trays, or on brackets.</p>
                </div>
                <div>
                  <h4 className="font-bold text-emerald-500 mb-2 uppercase tracking-widest text-[10px]">Method 100-103</h4>
                  <p className="text-gray-400">Specific methods for cables in contact with thermal insulation (lofts, etc).</p>
                </div>
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
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
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
              className="relative w-full max-w-md bg-hardware-card border border-white/10 rounded-t-[40px] sm:rounded-[40px] p-8 overflow-hidden"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-bold">Settings</h3>
                <button onClick={() => setShowSettingsModal(false)} className="text-gray-500 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
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
                    onClick={() => window.open(PRIVACY_POLICY_URL, '_blank')}
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
                    onClick={() => window.open(TERMS_OF_SERVICE_URL, '_blank')}
                    className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-left flex items-center justify-between transition-colors group"
                  >
                    <span className="text-sm font-medium">Terms of Service</span>
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                  </button>
                  <button 
                    onClick={() => window.open(SUPPORT_URL, '_blank')}
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
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full p-4 bg-red-500/10 hover:bg-red-500/20 rounded-2xl text-left flex items-center gap-3 text-red-500 transition-colors"
                    >
                      <AlertTriangle size={18} />
                      <span className="text-sm font-medium">Delete Account</span>
                    </button>
                  ) : (
                    <div id="delete-confirmation-ui" className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20 space-y-4">
                      <p className="text-xs text-red-500 font-bold leading-relaxed">
                        Are you sure? This action is permanent and will delete all your calculation history.
                      </p>
                      {deleteError && (
                        <p className="text-[10px] text-red-400 bg-red-400/10 p-2 rounded-lg border border-red-400/20">
                          {deleteError}
                        </p>
                      )}
                      {deleteSuccess && (
                        <p className="text-[10px] text-emerald-400 bg-emerald-400/10 p-2 rounded-lg border border-emerald-400/20">
                          Account deleted successfully. Logging out...
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button 
                          id="confirm-delete-button"
                          onClick={handleDeleteAccount}
                          disabled={isDeletingAccount || deleteSuccess}
                          className="flex-1 py-2 bg-red-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
                        >
                          {isDeletingAccount ? "Deleting..." : "Yes, Delete"}
                        </button>
                        <button 
                          id="cancel-delete-button"
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeleteError(null);
                          }}
                          disabled={isDeletingAccount || deleteSuccess}
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
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUpgradeModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-md bg-hardware-card border border-emerald-500/30 rounded-t-[40px] sm:rounded-[40px] p-8 overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
              
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center text-emerald-500 hardware-glow">
                  <Crown size={40} />
                </div>
              </div>

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">Unlock Pro Tools</h3>
                <p className="text-gray-400 text-sm">Get the full BS 7671 design suite and advanced features.</p>
              </div>

              <div className="space-y-4 mb-8">
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
                    <p className="font-bold text-sm">Priority Support</p>
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Direct access to experts</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={handleUpgrade}
                disabled={isUpgrading}
                className="w-full bg-emerald-500 text-black py-5 rounded-3xl font-black uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isUpgrading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Start 1 Month Free Trial'
                )}
              </button>
              
              <div className="flex flex-col items-center gap-4 mt-6">
                <button 
                  onClick={handleRestorePurchases}
                  className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest hover:text-emerald-400 transition-colors"
                >
                  Restore Purchases
                </button>

                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => window.open(PRIVACY_POLICY_URL, '_blank')}
                    className="text-[8px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Privacy Policy
                  </button>
                  <div className="w-1 h-1 bg-white/10 rounded-full" />
                  <button 
                    onClick={() => window.open(TERMS_OF_SERVICE_URL, '_blank')}
                    className="text-[8px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Terms of Use
                  </button>
                </div>
                
                <p className="text-[8px] text-gray-600 text-center leading-relaxed max-w-[280px]">
                  Payment of £5.99/mo will be charged to your account after the 1 month free trial.
                  Subscription automatically renews unless auto-renew is turned off at least 24-hours before the end of the current period.
                  Manage your subscription in your Account Settings.
                </p>

                <button 
                  onClick={() => setShowUpgradeModal(false)}
                  className="py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors"
                >
                  Maybe Later
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showLoginModal && (
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLoginModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-md bg-hardware-card border border-hardware-border rounded-t-[40px] sm:rounded-[40px] p-8 overflow-hidden"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-bold uppercase tracking-tight">Sign In</h3>
                <button onClick={() => setShowLoginModal(false)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Social Logins */}
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => handleLogin('google')}
                    className="flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all group"
                  >
                    <div className="w-5 h-5 bg-white/10 rounded flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                      <LogIn size={14} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest">Google</span>
                  </button>
                  <button 
                    onClick={() => handleLogin('apple')}
                    className="flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all group"
                  >
                    <div className="w-5 h-5 bg-white/10 rounded flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                      <Apple size={14} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest">Apple</span>
                  </button>
                </div>

                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/5"></div>
                  </div>
                  <div className="relative flex justify-center text-[8px] uppercase font-bold tracking-[0.2em] text-gray-600">
                    <span className="bg-hardware-card px-4">Or continue with email</span>
                  </div>
                </div>

                {/* Email Login */}
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

// End of BS7671 Field Toolkit components

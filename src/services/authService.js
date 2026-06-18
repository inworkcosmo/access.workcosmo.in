import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth } from "./firebase.js";
import { getRecord, setRecord } from "./firestoreService.js";

const OWNER_EMAILS = ["chandan@workcosmo.in"];
const OWNER_EMAIL_LABEL = OWNER_EMAILS.join(" or ");

export function watchAuth(callback) {
    return onAuthStateChanged(auth, callback);
}

export async function login(email, password) {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
}

export async function logout() {
    await signOut(auth);
}

export async function loadAccessSession(firebaseUser) {
    if (!firebaseUser) {
        return { firebaseUser: null, user: null, company: null, subscription: null, blocked: false };
    }

    const email = (firebaseUser.email || "").toLowerCase();
    const platformAdmin = await safeGetRecord("platformAdmins", firebaseUser.uid);
    if (platformAdmin?.status === "active") {
        return {
            firebaseUser,
            platformAdmin,
            user: {
                id: firebaseUser.uid,
                userId: firebaseUser.uid,
                name: platformAdmin.name || firebaseUser.email || "Platform Admin",
                email: firebaseUser.email,
                role: platformAdmin.role || "owner",
                status: "active"
            },
            company: null,
            subscription: null,
            blocked: false,
            adminMode: true
        };
    }

    if (OWNER_EMAILS.includes(email)) {
        try {
            await setRecord("platformAdmins", firebaseUser.uid, {
                name: email === "chandan@workcosmo.in" ? "Work Cosmo IT Admin" : "Work Cosmo Owner",
                email,
                role: "owner",
                status: "active",
                bootstrappedBy: "owner_email"
            });
            return loadAccessSession(firebaseUser);
        } catch (error) {
            return {
                firebaseUser,
                user: null,
                company: null,
                subscription: null,
                blocked: true,
                ownerOnly: true,
                ownerBootstrapMissing: true,
                blockedReason: `Owner profile is not initialized. Create /platformAdmins/${firebaseUser.uid} with email "${email}", role "owner", and status "active".`
            };
        }
    }

    return {
        firebaseUser,
        user: null,
        company: null,
        subscription: null,
        blocked: true,
        ownerOnly: true,
        blockedReason: `This private control panel is restricted to ${OWNER_EMAIL_LABEL}.`
    };
}

async function safeGetRecord(path, id) {
    try {
        return await getRecord(path, id);
    } catch (error) {
        if (error.code === "permission-denied" || error.message.includes("permissions")) {
            return null;
        }
        throw error;
    }
}

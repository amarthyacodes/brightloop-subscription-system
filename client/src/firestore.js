import { getFirestore } from "firebase/firestore";
import { firebaseApp } from "./firebase.js";

export const firestore = getFirestore(firebaseApp);

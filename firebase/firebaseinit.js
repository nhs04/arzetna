const admin = require("firebase-admin");

const serviceAccount = require("./firebase/firebase_connect.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Get a reference to the Firestore service
const db = admin.firestore();

async function createDocument(collectionName, documentData) {
    try {
      const docRef = await db.collection(collectionName).add(documentData);
      console.log("Document created with ID: ", docRef.id);
      return docRef.id;
    } catch (error) {
      console.error("Error adding document: ", error);
      return null;
    }
  }
  
  // Read a document
  async function getDocument(collectionName, documentId) {
    try {
      const docRef = db.collection(collectionName).doc(documentId);
      const doc = await docRef.get();
      if (!doc.exists) {
        console.log("No such document!");
        return null;
      } else {
        console.log("Document data:", doc.data());
        return doc.data();
      }
    } catch (error) {
      console.error("Error getting document:", error);
      return null;
    }
  }
  
  // Update a document
  async function updateDocument(collectionName, documentId, newData) {
    try {
      const docRef = db.collection(collectionName).doc(documentId);
      await docRef.update(newData);
      console.log("Document updated successfully");
      return true;
    } catch (error) {
      console.error("Error updating document:", error);
      return false;
    }
  }
  
  // Delete a document
  async function deleteDocument(collectionName, documentId) {
    try {
      await db.collection(collectionName).doc(documentId).delete();
      console.log("Document deleted successfully");
      return true;
    } catch (error) {
      console.error("Error deleting document:", error);
      return false;
    }
  }
  
  // Example usage
  (async () => {
    // Create a document
    const docId = await createDocument("users", {
      name: "John Doe",
      age: 30,
      email: "john@example.com"
    });
  
    // Read the created document
    await getDocument("users", docId);
  
    // Update the document
    await updateDocument("users", docId, { age: 31 });
  
    // Read the updated document
    await getDocument("users", docId);
  
    // Delete the document
    await deleteDocument("users", docId);
  })();
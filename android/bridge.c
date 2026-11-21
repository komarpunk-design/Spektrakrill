#include <jni.h>
#include <stdlib.h>
#include <string.h>
extern char *negs_request(const char *, const char *);
extern void negs_free(char *);
#ifdef NEGS_REFERENCE
#define JNI_METHOD Java_app_negs_android_Engine_requestReference
#else
#define JNI_METHOD Java_app_negs_android_Engine_request
#endif
JNIEXPORT jbyteArray JNICALL JNI_METHOD(JNIEnv *env, jclass cls, jbyteArray data, jbyteArray request) {
 jsize dl=(*env)->GetArrayLength(env,data),rl=(*env)->GetArrayLength(env,request);
 char *d=calloc((size_t)dl+1,1),*r=calloc((size_t)rl+1,1);
 if(!d||!r){free(d);free(r);(*env)->ThrowNew(env,(*env)->FindClass(env,"java/lang/OutOfMemoryError"),"JNI request allocation failed");return NULL;}
 (*env)->GetByteArrayRegion(env,data,0,dl,(jbyte*)d);(*env)->GetByteArrayRegion(env,request,0,rl,(jbyte*)r);
 char *result=negs_request(d,r);size_t n=strlen(result);
 jbyteArray out=(*env)->NewByteArray(env,(jsize)n);
 if(out)(*env)->SetByteArrayRegion(env,out,0,(jsize)n,(jbyte*)result);
 negs_free(result);free(d);free(r);return out;
}

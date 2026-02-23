import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import TextRecognition from 'react-native-text-recognition';
import { Button, H1, Paragraph, YStack } from 'tamagui';

 import { supabase } from '@/lib/supabase';

export default function StaffManagementScreen() {
  const [searchEmail, setSearchEmail] = useState('');
  const [formData, setFormData] = useState({
    role: 'staff',
    name: '',
    mobile: '',
    licenseNumber: '',
    documentType: 'aadhar',
    documentNumber: '',
    documentImage: null as string | null,
    extractedNumber: '',
    isActive: true,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitInfo, setSubmitInfo] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [docTypeOpen, setDocTypeOpen] = useState(false);

  const uploadDocumentImageAndGetPublicUrl = async (effectiveUserId: string) => {
    if (!formData.documentImage) return null;

    const { data: auth } = await supabase.auth.getUser();
    const uploaderId = auth.user?.id;
    if (!uploaderId) {
      throw new Error('Please login again.');
    }

    const uri = formData.documentImage;
    const fileExt = (uri.split('.').pop() || 'jpg').toLowerCase();
    const filePath = `${uploaderId}/${effectiveUserId}/doc-${Date.now()}.${fileExt}`;

    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage.from('driver-docs').upload(filePath, bytes, {
      contentType: `image/${fileExt}`,
      upsert: true,
    });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from('driver-docs').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const documentTypes = [
    { label: 'Aadhar Card', value: 'aadhar' },
    { label: 'PAN Card', value: 'pan' },
    { label: 'Voter ID', value: 'voter' },
    { label: 'Driving License', value: 'license' }
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const findAndPrefillUser = async ({ email, phone }: { email?: string; phone?: string }) => {
    const normalizedEmail = (email ?? '').trim();
    const normalizedPhone = (phone ?? '').trim();

    if (!normalizedEmail && !normalizedPhone) {
      setSubmitError('Enter email or mobile number to search.');
      return;
    }

    setSubmitError(null);
    setSubmitInfo(null);
    setSearching(true);
    try {
      let query = supabase
        .from('users')
        .select('id, name, phone, email, role, is_verified, license_number, document_type, document_number')
        .limit(1);

      if (normalizedEmail) {
        query = query.eq('email', normalizedEmail);
      } else {
        query = query.eq('phone', normalizedPhone);
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        setSubmitError(error.message);
        return;
      }

      if (!data?.id) {
        setSelectedUserId(null);
        setSelectedUserEmail(null);
        setSubmitError('User not found. First sign up/sign in, then come back and update role.');
        return;
      }

      setSelectedUserId(data.id);
      setSelectedUserEmail((data as any).email ?? null);
      setFormData((prev) => ({
        ...prev,
        name: (data as any).name ?? '',
        mobile: (data as any).phone ?? prev.mobile,
        role: ((data as any).role ?? prev.role) as any,
        isActive: Boolean((data as any).is_verified ?? true),
        licenseNumber: (data as any).license_number ?? '',
        documentType: ((data as any).document_type ?? prev.documentType) as any,
        documentNumber: (data as any).document_number ?? prev.documentNumber,
      }));

      if ((data as any).email) {
        setSearchEmail((data as any).email);
      }

      setSubmitInfo('User found. Details loaded.');
    } finally {
      setSearching(false);
    }
  };

  const validateMobile = (mobile: string) => {
    return /^[6-9]\d{9}$/.test(mobile);
  };

  const validateDocumentNumber = (type: string, number: string) => {
    switch (type) {
      case 'aadhar':
        return /^\d{12}$/.test(number);
      case 'pan':
        return /^[A-Z]{5}\d{4}[A-Z]{1}$/.test(number.toUpperCase());
      case 'voter':
        return /^[A-Z]{3}\d{7}$/.test(number.toUpperCase());
      case 'license':
        return /^[A-Z]{2}\d{2}\d{4}\d{7}$/.test(number.toUpperCase());
      default:
        return true;
    }
  };

  const getPatternForDoc = (type: string) => {
    switch (type) {
      case 'aadhar':
        return /\b\d{12}\b/;
      case 'pan':
        return /\b[A-Z]{5}\d{4}[A-Z]\b/;
      case 'voter':
        return /\b[A-Z]{3}\d{7}\b/;
      case 'license':
        return /\b[A-Z]{2}\d{2}\d{4}\d{7}\b/;
      default:
        return null;
    }
  };

  const extractNumberFromText = (text: string, type: string) => {
    const cleaned = text.replace(/\s+/g, '').toUpperCase();
    const pattern = getPatternForDoc(type);
    if (!pattern) return '';
    const match = cleaned.match(pattern);
    return match ? match[0] : '';
  };

  const runOcr = async (uri: string) => {
    const result = await TextRecognition.recognize(uri);
    if (Array.isArray(result)) {
      return result.join(' ');
    }
    return '';
  };

  const handleDocumentUpload = async (source: 'camera' | 'gallery') => {
    try {
      setUploading(true);
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please allow access to continue.');
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const imageUri = asset.uri;
      setFormData(prev => ({ ...prev, documentImage: imageUri }));

      const extractedText = await runOcr(imageUri);
      const extractedNumber = extractNumberFromText(extractedText, formData.documentType);
      setFormData(prev => ({ ...prev, extractedNumber }));

      if (extractedNumber) {
        Alert.alert('OCR Extracted', `Document number extracted: ${extractedNumber}`);
      } else {
        Alert.alert('OCR Result', 'No valid document number found. Please enter manually.');
      }
    } catch (err) {
      Alert.alert('OCR Error', 'Failed to read document. Try again with a clear image.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitInfo(null);

    if (!formData.name.trim() || formData.name.trim().length < 3) {
      setSubmitError('Name must be at least 3 characters');
      return;
    }

    if (!validateMobile(formData.mobile)) {
      setSubmitError('Please enter a valid 10-digit mobile number');
      return;
    }

    if (!validateDocumentNumber(formData.documentType, formData.documentNumber)) {
      setSubmitError(`Invalid ${formData.documentType} number format`);
      return;
    }

    if (!formData.extractedNumber) {
      setSubmitInfo('OCR could not read the document number. Continuing with manual entry.');
    } else if (formData.extractedNumber !== formData.documentNumber) {
      setSubmitInfo('OCR number does not match manual entry. Continuing with manual entry.');
    }

    if (saving) return;

    const mobile = formData.mobile.trim();
    const role = formData.role.trim().toLowerCase();
    const name = formData.name.trim();
    const licenseNumber = formData.licenseNumber.trim();

    const email = `${mobile}@packers.local`;

    setSaving(true);
    setSubmitInfo('Saving…');
    try {
      let effectiveUserId = selectedUserId;
      let effectiveUserEmail = selectedUserEmail;

      if (!effectiveUserId) {
        const { data: existing, error: findError } = await supabase
          .from('users')
          .select('id, email')
          .eq('phone', mobile)
          .maybeSingle();

        if (findError) {
          setSubmitError(findError.message);
          return;
        }

        if (!existing?.id) {
          setSubmitError('User not found. First sign up/sign in, then come back and update role.');
          return;
        }

        effectiveUserId = existing.id;
        effectiveUserEmail = (existing as any).email ?? null;
      }

      let documentImageUrl: string | null = null;
      if (formData.documentImage) {
        setSubmitInfo('Uploading document image…');
        documentImageUrl = await uploadDocumentImageAndGetPublicUrl(effectiveUserId);
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({
          name,
          phone: mobile,
          email: effectiveUserEmail ?? email,
          role,
          is_verified: Boolean(formData.isActive),
          license_number: role === 'driver' ? (licenseNumber || null) : null,
          document_type: formData.documentType,
          document_number: formData.documentNumber,
          ...(documentImageUrl ? { document_image_url: documentImageUrl } : {}),
        })
        .eq('id', effectiveUserId);

      if (updateError) {
        setSubmitError(updateError.message);
        return;
      }

      setSubmitInfo('Updated successfully.');
      Alert.alert('Success', 'Updated successfully!');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <YStack gap="$4" alignItems="center" width="100%">
        <Image 
          source={require('../../assets/images/PackersMoversLogo.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
        
        <H1 color="#F97316" fontSize={28} textAlign="center">
          Add Staff Member
        </H1>
        
        <Paragraph color="#6B7280" textAlign="center">
          Search an existing user and update their role with document verification
        </Paragraph>

        {submitError ? (
          <YStack width="100%" maxWidth={400} backgroundColor="#1F2937" padding={12} borderRadius={12}>
            <Text style={{ color: '#FCA5A5' }}>{submitError}</Text>
          </YStack>
        ) : null}

        {!submitError && submitInfo ? (
          <YStack width="100%" maxWidth={400} backgroundColor="#0F172A" padding={12} borderRadius={12}>
            <Text style={{ color: '#93C5FD' }}>{submitInfo}</Text>
          </YStack>
        ) : null}

        <YStack gap="$3" width="100%" maxWidth={400}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Search Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter email and search"
              value={searchEmail}
              onChangeText={setSearchEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <Button
            size="$3"
            backgroundColor="#111827"
            color="#E5E7EB"
            onPress={() => findAndPrefillUser({ email: searchEmail })}
            disabled={saving || searching}
            width="100%"
          >
            Search by Email
          </Button>

          {selectedUserEmail ? (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>User Email</Text>
              <TextInput style={styles.input} value={selectedUserEmail} editable={false} />
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Role</Text>
            <View style={styles.roleContainer}>
              {['staff', 'worker', 'driver', 'admin'].map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleButton,
                    formData.role === role && styles.roleButtonActive
                  ]}
                  onPress={() => handleInputChange('role', role)}
                >
                  <Text style={[
                    styles.roleButtonText,
                    formData.role === role && styles.roleButtonTextActive
                  ]}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.roleContainer}>
              <TouchableOpacity
                style={[styles.roleButton, formData.isActive && styles.roleButtonActive]}
                onPress={() => setFormData((p) => ({ ...p, isActive: true }))}
              >
                <Text style={[styles.roleButtonText, formData.isActive && styles.roleButtonTextActive]}>Active</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleButton, !formData.isActive && styles.roleButtonActive]}
                onPress={() => setFormData((p) => ({ ...p, isActive: false }))}
              >
                <Text style={[styles.roleButtonText, !formData.isActive && styles.roleButtonTextActive]}>Inactive</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter full name"
              value={formData.name}
              onChangeText={(value) => handleInputChange('name', value)}
              maxLength={50}
            />
          </View>

          {formData.role === 'driver' ? (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>License Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter license number (optional)"
                value={formData.licenseNumber}
                onChangeText={(value) => handleInputChange('licenseNumber', value)}
                maxLength={30}
                autoCapitalize="characters"
              />
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Mobile Number</Text>
            <TextInput
              style={styles.input}
              placeholder="Search by mobile (10 digits)"
              value={formData.mobile}
              onChangeText={(value) => handleInputChange('mobile', value.replace(/\D/g, ''))}
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>

          <Button
            size="$3"
            backgroundColor="#111827"
            color="#E5E7EB"
            onPress={() => findAndPrefillUser({ phone: formData.mobile })}
            disabled={saving || searching}
            width="100%"
          >
            Search by Mobile
          </Button>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Document Type</Text>
            <View style={styles.pickerContainer}>
              <TouchableOpacity
                style={[styles.docTypeButton, styles.docTypeButtonActive]}
                onPress={() => setDocTypeOpen((p) => !p)}>
                <Text style={[styles.docTypeButtonText, styles.docTypeButtonTextActive]}>
                  {documentTypes.find((d) => d.value === formData.documentType)?.label ?? 'Select'}
                </Text>
              </TouchableOpacity>
            </View>

            {docTypeOpen ? (
              <View style={{ marginTop: 8, backgroundColor: '#0F172A', borderRadius: 12, padding: 8 }}>
                {documentTypes.map((doc) => (
                  <TouchableOpacity
                    key={doc.value}
                    style={{ paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10 }}
                    onPress={() => {
                      handleInputChange('documentType', doc.value);
                      setDocTypeOpen(false);
                    }}>
                    <Text style={{ color: '#E5E7EB' }}>{doc.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Document Number</Text>
            <TextInput
              style={styles.input}
              placeholder={`Enter ${formData.documentType} number`}
              value={formData.documentNumber}
              onChangeText={(value) => handleInputChange('documentNumber', value.toUpperCase())}
              maxLength={formData.documentType === 'aadhar' ? 12 : 20}
            />
          </View>

          <View style={styles.inputContainer}>
            <View style={styles.uploadRow}>
              <TouchableOpacity style={styles.uploadButton} onPress={() => handleDocumentUpload('camera')} disabled={uploading}>
                <Text style={styles.uploadButtonText}>📷 Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.uploadButton} onPress={() => handleDocumentUpload('gallery')} disabled={uploading}>
                <Text style={styles.uploadButtonText}>🖼️ Gallery</Text>
              </TouchableOpacity>
            </View>
            {formData.documentImage ? (
              <Image source={{ uri: formData.documentImage }} style={styles.previewImage} />
            ) : null}
            {formData.extractedNumber ? (
              <Text style={styles.ocrText}>OCR Extracted: {formData.extractedNumber}</Text>
            ) : null}
          </View>

          <Button 
            size="$4" 
            backgroundColor="#F97316" 
            color="#0B0B12" 
            onPress={handleSubmit}
            disabled={uploading || saving}
            width="100%"
            fontFamily="Times New Roman"
            fontWeight="bold"
          >
            Update {formData.role.charAt(0).toUpperCase() + formData.role.slice(1)}
          </Button>
        </YStack>
      </YStack>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B12',
  },
  contentContainer: {
    padding: 24,
    flexGrow: 1,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 20,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Times New Roman',
  },
  input: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 16,
    color: '#F9FAFB',
    fontSize: 16,
    fontFamily: 'Times New Roman',
  },
  roleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    padding: 12,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  roleButtonActive: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  roleButtonText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Times New Roman',
  },
  roleButtonTextActive: {
    color: '#0B0B12',
  },
  pickerContainer: {
    gap: 8,
  },
  docTypeButton: {
    padding: 12,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 8,
  },
  docTypeButtonActive: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  docTypeButtonText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Times New Roman',
  },
  docTypeButtonTextActive: {
    color: '#0B0B12',
  },
  uploadButton: {
    backgroundColor: '#374151',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginTop: 12,
  },
  ocrText: {
    color: '#F97316',
    fontSize: 12,
    marginTop: 8,
    fontFamily: 'Times New Roman',
  },
  uploadButtonText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Times New Roman',
  },
});

import { Modal, Pressable, ScrollView } from 'react-native';
import { useState, useMemo } from 'react';
import { YStack, XStack, Text } from 'tamagui';

type Props = {
  value: Date;
  onChange: (d: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  open: boolean;
  onClose: () => void;
};

export default function MobileDatePicker({ value, onChange, minDate, maxDate, open, onClose }: Props) {
  const [vy, setVy] = useState(value.getFullYear());
  const [vm, setVm] = useState(value.getMonth());
  const [showYearSelect, setShowYearSelect] = useState(false);
  const daysIn = new Date(vy, vm + 1, 0).getDate();
  const fdow = new Date(vy, vm, 1).getDay();
  const days: (number | null)[] = Array(fdow).fill(null);
  for (let d = 1; d <= daysIn; d++) days.push(d);
  const monNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dis = (d: number) => {
    const dt = new Date(vy, vm, d, 12, 0, 0, 0);
    dt.setHours(0, 0, 0, 0);
    if (minDate && dt.getTime() < minDate.getTime()) return true;
    if (maxDate && dt.getTime() > maxDate.getTime()) return true;
    return false;
  };
  const pick = (d: number) => { onChange(new Date(vy, vm, d, 12, 0, 0, 0)); onClose(); };
  const prevM = () => { if (vm === 0) { setVy(y => y - 1); setVm(11); } else setVm(m => m - 1); };
  const nextM = () => { if (vm === 11) { setVy(y => y + 1); setVm(0); } else setVm(m => m + 1); };
  const prevY = () => setVy(y => y - 1);
  const nextY = () => setVy(y => y + 1);
  const currentYear = new Date().getFullYear();
  const yearRange = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear - 80; y <= currentYear + 20; y++) years.push(y);
    return years;
  }, [currentYear]);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <YStack flex={1} jc="center" ai="center" bg="rgba(0,0,0,0.5)">
        <YStack bg="#FFF" br={16} p={20} w="90%" maw={360}>
          <XStack jc="space-between" ai="center" mb={12}>
            <Pressable onPress={prevM} disabled={showYearSelect}>
              <Text fontSize={22} color={showYearSelect ? '#CCC' : '#1F4E79'} fontWeight="700">{'◀'}</Text>
            </Pressable>
            <XStack ai="center" gap={8}>
              <Text fontWeight="800" fontSize={18} color="#000">{monNames[vm]}</Text>
              <XStack ai="center" gap={2}>
                <Pressable onPress={prevY} disabled={showYearSelect}>
                  <Text fontSize={14} color={showYearSelect ? '#CCC' : '#1F4E79'} fontWeight="700">◀</Text>
                </Pressable>
                <Pressable onPress={() => setShowYearSelect(!showYearSelect)}>
                  <XStack ai="center" gap={4} bg="#F0F4F8" px={8} py={3} br={6}>
                    <Text fontWeight="800" fontSize={16} color="#1F4E79">{vy}</Text>
                    <Text fontSize={9} color="#1F4E79">▼</Text>
                  </XStack>
                </Pressable>
                <Pressable onPress={nextY} disabled={showYearSelect}>
                  <Text fontSize={14} color={showYearSelect ? '#CCC' : '#1F4E79'} fontWeight="700">▶</Text>
                </Pressable>
              </XStack>
            </XStack>
            <Pressable onPress={nextM} disabled={showYearSelect}>
              <Text fontSize={22} color={showYearSelect ? '#CCC' : '#1F4E79'} fontWeight="700">{'▶'}</Text>
            </Pressable>
          </XStack>
          {showYearSelect ? (
            <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
              <XStack flexWrap="wrap" jc="center" gap={8} py={10}>
                {yearRange.map(year => (
                  <Pressable
                    key={year}
                    onPress={() => { setVy(year); setShowYearSelect(false); }}
                    style={{
                      width: '28%',
                      alignItems: 'center',
                      paddingVertical: 10,
                      backgroundColor: vy === year ? '#1F4E79' : '#F0F4F8',
                      borderRadius: 8,
                    }}>
                    <Text fontWeight="700" color={vy === year ? '#FFF' : '#333'}>{year}</Text>
                  </Pressable>
                ))}
              </XStack>
            </ScrollView>
          ) : (
            <>
              <XStack flexWrap="wrap">
                {dayNames.map(d => <YStack key={d} w="14.28%" ai="center" py={6}><Text fontSize={12} color="#666">{d}</Text></YStack>)}
              </XStack>
              <XStack flexWrap="wrap">
                {days.map((d, i) => (
                  <YStack key={i} w="14.28%" ai="center" py={2}>
                    {d ? (
                      <Pressable onPress={() => pick(d)} disabled={dis(d)}>
                        <YStack w={36} h={36} br={18} ai="center" jc="center" bg={value.getDate() === d && value.getMonth() === vm && value.getFullYear() === vy ? '#1F4E79' : 'transparent'} opacity={dis(d) ? 0.25 : 1}>
                          <Text fontSize={14} fontWeight="600" color={value.getDate() === d && value.getMonth() === vm && value.getFullYear() === vy ? '#FFF' : '#000'}>{d}</Text>
                        </YStack>
                      </Pressable>
                    ) : <YStack w={36} h={36} />}
                  </YStack>
                ))}
              </XStack>
            </>
          )}
          <Pressable onPress={onClose}><YStack ai="center" py={10} mt={4}><Text color="#1F4E79" fontWeight="700">Cancel</Text></YStack></Pressable>
        </YStack>
      </YStack>
    </Modal>
  );
}

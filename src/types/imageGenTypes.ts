
export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';

export interface ImageSizePreset {
  label: string;
  w: number;
  h: number;
}

export interface ReferenceImage {
  data: string;
  mimeType: string;
}

export interface PromoData {
  type: string;
  title: string;
  price: string;
  details: string;
}

export interface PromoAdvanced {
    startDate: string;
    endDate: string;
    validHours: string;
    days: string[];
    discountType: string;
    quantityLimit: string;
    category: string;
    serves: string;
    observations: string;
    delivery: { 
        delivery: boolean; 
        pickup: boolean; 
        dineIn: boolean; 
        fee: boolean; 
        time: string; 
    };
    marketing: { 
        phrase: string; 
        cta: string; 
        tag: string; 
    };
    visuals: { 
        style: string; 
        background: string; 
    };
}

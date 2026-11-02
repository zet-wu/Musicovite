use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

pub const POINTS: usize = 512;

#[derive(Clone)]
pub struct SignalFrame {
    pub samples: [f32; POINTS],
    pub sequence: u32,
    pub sample_rate: u32,
    pub channels: u32,
    pub valid: bool,
    pub count: usize,
    cursor: usize,
}

pub struct VisualizationTap {
    enabled: AtomicBool,
    waiting: AtomicBool,
    frame: Mutex<SignalFrame>,
}

impl VisualizationTap {
    pub fn new() -> Self {
        Self {
            enabled: AtomicBool::new(false),
            waiting: AtomicBool::new(false),
            frame: Mutex::new(SignalFrame {
                samples: [0.0; POINTS],
                sequence: 0,
                sample_rate: 0,
                channels: 0,
                valid: false,
                count: 0,
                cursor: 0,
            }),
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
        if !enabled {
            let mut frame = self.frame.lock();
            frame.valid = false;
            frame.count = 0;
            frame.cursor = 0;
        }
    }

    pub fn invalidate(&self) {
        self.waiting.store(true, Ordering::Release);
        let mut frame = self.frame.lock();
        frame.valid = false;
        frame.count = 0;
        frame.cursor = 0;
    }

    pub fn resume(&self) {
        self.waiting.store(false, Ordering::Release);
    }

    // 实时线程仅尝试获取预分配缓冲，竞争时丢帧，不等待、不分配。
    pub fn capture(&self, input: &[f32], channels: usize, sample_rate: u32, volume: f32) {
        if !self.enabled.load(Ordering::Relaxed)
            || self.waiting.load(Ordering::Acquire)
            || channels == 0
        {
            return;
        }
        let Some(mut frame) = self.frame.try_lock() else {
            return;
        };
        if self.waiting.load(Ordering::Acquire) {
            return;
        }
        let count = (input.len() / channels).min(POINTS);
        let start = input.len() / channels - count;
        for i in 0..count {
            let mut sum = 0.0;
            for channel in 0..channels {
                sum += (input[(start + i) * channels + channel] * volume).clamp(-1.0, 1.0);
            }
            let cursor = frame.cursor;
            frame.samples[cursor] = sum / channels as f32;
            frame.cursor = (cursor + 1) % POINTS;
        }
        frame.count = (frame.count + count).min(POINTS);
        frame.sequence = frame.sequence.wrapping_add(1);
        frame.sample_rate = sample_rate;
        frame.channels = channels as u32;
        frame.valid = count > 0;
    }

    pub fn read(&self) -> SignalFrame {
        let mut frame = self.frame.lock().clone();
        if frame.count == POINTS {
            frame.samples.rotate_left(frame.cursor);
        }
        frame
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn captures_post_volume_mono_and_invalidates_seek() {
        let tap = VisualizationTap::new();
        tap.set_enabled(true);
        tap.capture(&[0.8, 0.4, -0.8, -0.4], 2, 48000, 0.5);
        let frame = tap.read();
        assert!(frame.valid);
        assert!((frame.samples[0] - 0.3).abs() < 0.00001);
        assert!((frame.samples[1] + 0.3).abs() < 0.00001);
        tap.invalidate();
        tap.capture(&[1.0; 512], 1, 48000, 1.0);
        assert!(!tap.read().valid);
        tap.resume();
        tap.capture(&[1.0; 512], 1, 48000, 0.0);
        assert!(tap.read().samples.iter().all(|sample| *sample == 0.0));
    }
    #[test]
    fn contention_and_disabled_sampling_drop_frames() {
        let tap = VisualizationTap::new();
        tap.capture(&[1.0; 512], 1, 48000, 1.0);
        assert_eq!(tap.read().sequence, 0);
        tap.set_enabled(true);
        let guard = tap.frame.lock();
        tap.capture(&[1.0; 512], 1, 48000, 1.0);
        assert_eq!(guard.sequence, 0);
    }
}

"""
TrackNet — arquitetura exata do checkpoint yastrebksv/TrackNet.

Estrutura derivada da inspeção do state_dict:
  18 blocos Conv-ReLU-BN sequenciais (sem skip connections)
  MaxPool após blocos 2, 4, 7
  Upsample bilinear após blocos 10, 13, 15
  Saída: 256 canais (heatmap discretizado 0-255)
"""

import torch.nn as nn


def _conv_block(in_ch, out_ch):
    return nn.Sequential(
        nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1),
        nn.ReLU(inplace=True),
        nn.BatchNorm2d(out_ch),
    )


class TrackNet(nn.Module):
    def __init__(self):
        super().__init__()
        # Encoder
        self.conv1  = _conv_block(9, 64)
        self.conv2  = _conv_block(64, 64)
        self.conv3  = _conv_block(64, 128)
        self.conv4  = _conv_block(128, 128)
        self.conv5  = _conv_block(128, 256)
        self.conv6  = _conv_block(256, 256)
        self.conv7  = _conv_block(256, 256)
        self.conv8  = _conv_block(256, 512)
        self.conv9  = _conv_block(512, 512)
        self.conv10 = _conv_block(512, 512)
        # Decoder
        self.conv11 = _conv_block(512, 256)
        self.conv12 = _conv_block(256, 256)
        self.conv13 = _conv_block(256, 256)
        self.conv14 = _conv_block(256, 128)
        self.conv15 = _conv_block(128, 128)
        self.conv16 = _conv_block(128, 64)
        self.conv17 = _conv_block(64, 64)
        self.conv18 = _conv_block(64, 256)

        self.pool = nn.MaxPool2d(kernel_size=2, stride=2)
        self.up   = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False)

    def forward(self, x):
        x = self.conv2(self.conv1(x));         x = self.pool(x)
        x = self.conv4(self.conv3(x));         x = self.pool(x)
        x = self.conv7(self.conv6(self.conv5(x))); x = self.pool(x)
        x = self.conv10(self.conv9(self.conv8(x))); x = self.up(x)
        x = self.conv13(self.conv12(self.conv11(x))); x = self.up(x)
        x = self.conv15(self.conv14(x));       x = self.up(x)
        x = self.conv18(self.conv17(self.conv16(x)))
        return x  # (B, 256, H, W)

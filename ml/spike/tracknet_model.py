"""
TrackNetV2 — arquitetura baseada no paper:
"TrackNetV2: Efficient Shuttlecock Tracking Network" (2021)

Input : 3 frames consecutivos empilhados → tensor (B, 9, H, W)
Output: heatmap (B, 1, H, W) com probabilidade de posição da bola
"""

import torch
import torch.nn as nn


def _conv_bn_relu(in_ch, out_ch, kernel=3, padding=1):
    return nn.Sequential(
        nn.Conv2d(in_ch, out_ch, kernel, padding=padding, bias=False),
        nn.BatchNorm2d(out_ch),
        nn.ReLU(inplace=True),
    )


class TrackNetV2(nn.Module):
    def __init__(self):
        super().__init__()

        # Encoder (VGG16-like, modificado para 9 canais de entrada)
        self.enc1 = nn.Sequential(
            _conv_bn_relu(9, 64),
            _conv_bn_relu(64, 64),
        )
        self.enc2 = nn.Sequential(
            nn.MaxPool2d(2, 2),
            _conv_bn_relu(64, 128),
            _conv_bn_relu(128, 128),
        )
        self.enc3 = nn.Sequential(
            nn.MaxPool2d(2, 2),
            _conv_bn_relu(128, 256),
            _conv_bn_relu(256, 256),
            _conv_bn_relu(256, 256),
        )
        self.enc4 = nn.Sequential(
            nn.MaxPool2d(2, 2),
            _conv_bn_relu(256, 512),
            _conv_bn_relu(512, 512),
            _conv_bn_relu(512, 512),
        )

        # Decoder com skip connections
        self.up3 = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False)
        self.dec3 = nn.Sequential(
            _conv_bn_relu(512 + 256, 256),
            _conv_bn_relu(256, 256),
            _conv_bn_relu(256, 256),
        )
        self.up2 = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False)
        self.dec2 = nn.Sequential(
            _conv_bn_relu(256 + 128, 128),
            _conv_bn_relu(128, 128),
        )
        self.up1 = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False)
        self.dec1 = nn.Sequential(
            _conv_bn_relu(128 + 64, 64),
            _conv_bn_relu(64, 64),
        )

        self.head = nn.Sequential(
            nn.Conv2d(64, 1, kernel_size=1),
            nn.Sigmoid(),
        )

    def forward(self, x):
        e1 = self.enc1(x)
        e2 = self.enc2(e1)
        e3 = self.enc3(e2)
        e4 = self.enc4(e3)

        d3 = self.dec3(torch.cat([self.up3(e4), e3], dim=1))
        d2 = self.dec2(torch.cat([self.up2(d3), e2], dim=1))
        d1 = self.dec1(torch.cat([self.up1(d2), e1], dim=1))

        return self.head(d1)
